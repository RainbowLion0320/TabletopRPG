"""Read artist masters and export only the adopted runtime cinematic resources."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--ffmpeg', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = root / 'assets/cinematics'
output.mkdir(parents=True, exist_ok=True)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
sources = {name: args.source / name for name in ['竖版-纯音效.mp4', '竖版-bgm+音效.mp4', '横板-纯音效.mp4', '横板-BGM+音效.mp4']}
originals = {name: {'bytes': file.stat().st_size, 'sha256': sha(file)} for name, file in sources.items()}

def run(*options):
    subprocess.run([str(args.ffmpeg), '-hide_banner', '-loglevel', 'error', '-y', *map(str, options)], check=True)

for orientation, name in [('portrait', '竖版-纯音效.mp4'), ('landscape', '横板-纯音效.mp4')]:
    run('-i', sources[name], '-map', '0:v:0', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-threads', '4', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.0',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-map_metadata', '-1', '-movflags', '+faststart', output / f'opening-{orientation}.mp4')
    run('-i', sources[name], '-frames:v', '1', '-vf', 'scale=720:-2', '-c:v', 'libwebp', '-quality', '92',
        output / f'opening-{orientation}-poster.webp')
run('-i', sources['竖版-纯音效.mp4'], '-vn', '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1',
    '-movflags', '+faststart', output / 'opening-effects.m4a')
run('-i', sources['竖版-bgm+音效.mp4'], '-i', sources['竖版-纯音效.mp4'],
    '-filter_complex', '[1:a:0]volume=-1[inverse];[0:a:0][inverse]amix=inputs=2:duration=shortest:normalize=0[music]',
    '-map', '[music]', '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '-1', '-movflags', '+faststart',
    output / 'opening-music.m4a')
assert all(sha(sources[name]) == entry['sha256'] for name, entry in originals.items()), 'Artist masters must stay unchanged'
files = {file.name: {'bytes': file.stat().st_size, 'sha256': sha(file)} for file in sorted(output.iterdir())
         if file.suffix in {'.mp4', '.m4a', '.webp'}}
manifest = {'source': str(args.source), 'date': '2026-10-14', 'originals': originals,
            'policy': 'Original framing, 30fps, BT.709; silent H.264 pictures. Effects from supplied effects version; music derived from aligned mixed-minus-effects decoded tracks, not an original isolated stem.',
            'files': files}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(files), 'bytes': sum(item['bytes'] for item in files.values()), 'originalsUnchanged': True}))
