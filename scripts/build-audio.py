"""Prepare the shipped audio from licensed sources; requires numpy and ffmpeg.

Download the files named in assets/audio/README.md into output/audio-source,
extract the three Kenney packs as casino/, interface/, rpg/, then run this script.
Original downloads and intermediate WAVs stay in ignored output/.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/audio-source'
DEST = ROOT / 'assets/audio'
RATE = 32000
RNG = np.random.default_rng(19200713)
REPORT = []


def decode(name, start=0, duration=None):
    args = ['ffmpeg', '-v', 'error', '-ss', str(start), '-i', str(SOURCE / name)]
    if duration is not None:
        args += ['-t', str(duration)]
    result = subprocess.run(args + ['-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-'], check=True, capture_output=True)
    return np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2).copy()


def loop(data, seconds):
    """Place the crossfade at the front; the final sample joins the same source position."""
    n = int(seconds * RATE)
    fade = np.linspace(0, 1, n, endpoint=False)[:, None]
    seam = data[-n:] * np.cos(fade * np.pi / 2) + data[:n] * np.sin(fade * np.pi / 2)
    return np.concatenate([seam, data[n:-n]])


def write(name, data, rms_db, source):
    data -= np.mean(data, axis=0)
    data *= 10 ** (rms_db / 20) / max(np.sqrt(np.mean(data ** 2)), 1e-8)
    peak = np.max(np.abs(data))
    if peak > 0.65:
        data *= 0.65 / peak
    target = DEST / name
    target.parent.mkdir(parents=True, exist_ok=True)
    raw = SOURCE / (target.stem + '-prepared.wav')
    with wave.open(str(raw), 'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((data * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(raw), '-map_metadata', '-1',
                    '-codec:a', 'libmp3lame', '-b:a', '96k', str(target)], check=True)
    REPORT.append({'file': name, 'source': source, 'seconds': round(len(data) / RATE, 3),
                   'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})


for output, name, start in [
    ('fog-theme', 'darkest-child.mp3', 15),
    ('quiet-investigation', 'comfortable-mystery.mp3', 30),
    ('approaching-darkness', 'long-note-one.mp3', 60),
]:
    write(f'music/{output}.mp3', loop(decode(name, start, 64), 4), -21, name)

for output, source in [
    ('interface-click', 'interface/Audio/click_001.ogg'),
    ('paper-open', 'rpg/Audio/bookFlip2.ogg'),
    ('dice-shake', 'casino/Audio/dice-shake-1.ogg'),
    ('dice-land', 'casino/Audio/dice-throw-1.ogg'),
]:
    data = decode(source)
    # Tiny endpoint fades remove codec-edge clicks without softening the tactile attack.
    n = min(int(0.004 * RATE), len(data) // 4)
    data[:n] *= np.linspace(0, 1, n)[:, None]
    data[-n:] *= np.linspace(1, 0, n)[:, None]
    write(f'sfx/{output}.mp3', data, -20, source)


def colored_noise(seconds, low, high):
    n = int(seconds * RATE)
    frequencies = np.fft.rfftfreq(n, 1 / RATE)
    spectrum = np.fft.rfft(RNG.normal(size=(n, 2)), axis=0)
    weight = 1 / np.sqrt(np.maximum(frequencies, 30))
    weight *= (1 - np.exp(-(frequencies / low) ** 4)) * np.exp(-(frequencies / high) ** 2)
    noise = np.fft.irfft(spectrum * weight[:, None], n=n, axis=0)
    return noise / np.std(noise)


# These are authored noise textures, not third-party field recordings. No voices or jump scares.
t = np.arange(24 * RATE) / RATE
rain = colored_noise(24, 180, 3800) * (0.85 + 0.10 * np.sin(2 * np.pi * t / 9))[:, None]
room = colored_noise(24, 90, 850) * (0.8 + 0.07 * np.sin(2 * np.pi * t / 13))[:, None]
water = colored_noise(24, 65, 1600) * (0.5 + 0.45 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 6)) ** 2)[:, None]
for name, data in [('rain-window', rain), ('old-room', room), ('harbor-water', water)]:
    write(f'ambience/{name}.mp3', loop(data, 4), -26, 'Project synthesis (this script)')

for name, notes in [('check-success', [261.63, 311.13, 392.0]), ('check-failure', [233.08, 196.0])]:
    cue = np.zeros((int(1.25 * RATE), 2))
    for index, frequency in enumerate(notes):
        start = int(index * 0.19 * RATE)
        local = np.arange(len(cue) - start) / RATE
        envelope = (1 - np.exp(-local * 80)) * np.exp(-local * 7)
        tone = (np.sin(2 * np.pi * frequency * local) + 0.12 * np.sin(2 * np.pi * frequency * 2 * local)) * envelope
        cue[start:] += tone[:, None]
    cue[-int(0.08 * RATE):] *= np.linspace(1, 0, int(0.08 * RATE))[:, None]
    write(f'sfx/{name}.mp3', cue, -25, 'Project synthesis (this script)')

(DEST / 'manifest.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Prepared {len(REPORT)} files, {sum(item["bytes"] for item in REPORT) / 1024 / 1024:.2f} MiB total.')
