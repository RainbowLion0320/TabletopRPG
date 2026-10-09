import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';
import { audioAssets, getSoundscape } from '../../src/audio/catalog';
import { AUDIO_SETTINGS_KEY, loadAudioSettings, normalizeAudioSettings } from '../../src/audio/settings';
import type { GameState } from '../../src/types/game';

class Parameter {
  value = 1;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  cancelAndHoldAtTime = vi.fn();
}
class Gain {
  gain = new Parameter();
  connect = vi.fn();
  disconnect = vi.fn();
}
class Source {
  buffer: { id: number } | null = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
  onended: (() => void) | null = null;
}
class Context {
  static instances: Context[] = [];
  state = 'running';
  onstatechange: (() => void) | null = null;
  currentTime = 0;
  destination = {};
  gains: Gain[] = [];
  sources: Source[] = [];
  constructor() { Context.instances.push(this); }
  createGain = () => { const gain = new Gain(); this.gains.push(gain); return gain; };
  createBufferSource = () => { const source = new Source(); this.sources.push(source); return source; };
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => {
    const id = new Uint8Array(data)[0];
    return { id, duration: id <= 3 ? 60 : id <= 6 ? 20 : 1 };
  });
  private changeState(state: string) {
    if (this.state === state) return;
    this.state = state;
    this.onstatechange?.();
  }
  resume = vi.fn(async () => { this.changeState('running'); });
  suspend = vi.fn(async () => { this.changeState('suspended'); });
  close = vi.fn(async () => { this.changeState('closed'); });
}

const ids = Object.fromEntries(Object.entries(audioAssets).map(([key, url], index) => [url, index + 1]));
const response = (url: string) => ({ ok: true, arrayBuffer: async () => new Uint8Array([ids[url]]).buffer });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
let engine: AudioEngine;
beforeEach(() => {
  localStorage.clear();
  Context.instances = [];
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url)));
  engine = new AudioEngine();
});
afterEach(() => { engine.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('audio preferences', () => {
  it('preserves silence and false values, clamps volumes and rejects malformed values', () => {
    expect(normalizeAudioSettings({ musicEnabled: false, musicVolume: 0, effectsEnabled: 'false', effectsVolume: 8 }))
      .toEqual({ musicEnabled: false, musicVolume: 0, effectsEnabled: true, effectsVolume: 1 });
    localStorage.setItem(AUDIO_SETTINGS_KEY, '{broken');
    expect(loadAudioSettings().musicEnabled).toBe(true);
    expect(normalizeAudioSettings({ musicVolume: NaN }).musicVolume).toBe(0.3);
  });
  it('persists independently of a game save and works when storage is blocked', () => {
    engine.updateSettings({ musicEnabled: false, effectsVolume: 0.2 });
    expect(loadAudioSettings()).toMatchObject({ musicEnabled: false, effectsVolume: 0.2 });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => engine.updateSettings({ effectsEnabled: false })).not.toThrow();
    expect(engine.getSnapshot().effectsEnabled).toBe(false);
  });
});

describe('audio lifetime and races', () => {
  it('retains crossfading buffers for quick returns, then releases inactive long tracks while reusing short effects', async () => {
    const cache = (engine as unknown as { buffers: Map<keyof typeof audioAssets, Promise<AudioBuffer>> }).buffers;
    engine.setSoundscape({ music: 'theme', ambience: 'rain' }); engine.unlock(); await flush();
    const context = Context.instances[0];
    engine.play('paper'); await flush();
    context.sources.find(source => source.buffer?.id === ids[audioAssets.paper])!.onended!();
    engine.setSoundscape({ music: 'investigation', ambience: 'room' }); await flush();
    expect(cache.has('theme')).toBe(true);
    const fetches = vi.mocked(fetch).mock.calls.length;
    engine.setSoundscape({ music: 'theme', ambience: 'rain' }); await flush();
    expect(fetch).toHaveBeenCalledTimes(fetches);
    context.sources.filter(source => source.stop.mock.calls.length).forEach(source => source.onended?.());
    expect([...cache.keys()].sort()).toEqual(['paper', 'rain', 'theme']);
    engine.setVisible(false); engine.setSoundscape({ music: 'tension', ambience: 'water' }); await flush();
    expect([...cache.keys()]).toEqual(['paper']);
    engine.setVisible(true); await flush();
    expect(context.sources.slice(-2).map(source => source.buffer?.id)).toEqual([ids[audioAssets.tension], ids[audioAssets.water]]);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === audioAssets.paper)).toHaveLength(1);
  });

  it('does not keep an obsolete long decode after a pending scene is abandoned', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve as typeof release; }));
    engine.setSoundscape({ music: 'theme', ambience: null }); engine.unlock();
    engine.setSoundscape({ music: 'tension', ambience: null }); await flush();
    release(response(audioAssets.theme)); await flush();
    const cache = (engine as unknown as { buffers: Map<keyof typeof audioAssets, Promise<AudioBuffer>> }).buffers;
    expect([...cache.keys()]).toEqual(['tension']);
    expect(Context.instances[0].sources.map(source => source.buffer?.id)).toEqual([ids[audioAssets.tension]]);
  });

  it('starts a track decoded during device suspension when the device resumes without another gesture', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as typeof release; }));
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    const context = Context.instances[0];
    await context.suspend();
    release(response(audioAssets.theme));
    await flush();
    expect(context.sources).toHaveLength(0);
    await context.resume();
    await flush();
    expect(context.sources.map((source) => source.buffer?.id)).toEqual([ids[audioAssets.theme]]);
    expect(fetch).toHaveBeenCalledTimes(1);
    engine.unlock();
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it('resumes only the latest enabled soundscape and drops effects delayed across a device interruption', async () => {
    engine.setSoundscape({ music: 'theme', ambience: 'rain' });
    engine.unlock();
    await flush();
    const context = Context.instances[0];
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as typeof release; }));
    engine.play('paper');
    await context.suspend();
    engine.setSoundscape({ music: 'tension', ambience: 'water' });
    engine.updateSettings({ musicEnabled: false });
    await context.resume();
    release(response(audioAssets.paper));
    await flush();
    expect(context.sources.map((source) => source.buffer?.id))
      .toEqual([ids[audioAssets.theme], ids[audioAssets.rain], ids[audioAssets.water]]);
    expect(fetch).not.toHaveBeenCalledWith(audioAssets.tension);
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.sources[0].stop).toHaveBeenCalled();
    expect(context.sources[1].stop).toHaveBeenCalledWith(1.8);
    engine.dispose();
    expect(context.onstatechange).toBeNull();
  });

  it('does not load audio or create a context until a user gesture', async () => {
    engine.setSoundscape({ music: 'theme', ambience: 'rain' });
    await flush();
    expect(Context.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    engine.unlock();
    await flush();
    expect(Context.instances[0].sources.filter((source) => source.loop)).toHaveLength(2);
  });

  it('does not start a decoded track after it was muted; effects remain independent', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as typeof release; }));
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    engine.updateSettings({ musicEnabled: false });
    release(response(audioAssets.theme));
    await flush();
    const context = Context.instances[0];
    expect(context.sources).toHaveLength(0);
    engine.play('diceLand');
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.gains[1].gain.value).toBe(0.55);
  });

  it('ignores a pending B when the player returns to the already-playing A', async () => {
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    await flush();
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as typeof release; }));
    engine.setSoundscape({ music: 'tension', ambience: null });
    engine.setSoundscape({ music: 'theme', ambience: null });
    release(response(audioAssets.tension));
    await flush();
    expect(Context.instances[0].sources).toHaveLength(1);
    expect(Context.instances[0].sources[0].buffer?.id).toBe(ids[audioAssets.theme]);
  });

  it('crossfades a changed track and never restarts an unchanged track', async () => {
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    await flush();
    const context = Context.instances[0];
    engine.setSoundscape({ music: 'theme', ambience: null });
    await flush();
    expect(context.sources).toHaveLength(1);
    engine.setSoundscape({ music: 'investigation', ambience: null });
    await flush();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].stop).toHaveBeenCalledWith(1.8);
    engine.updateSettings({ musicEnabled: false });
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.sources[1].stop).toHaveBeenCalled();
  });

  it('cancels stale effects, suspends in background and resumes only the current soundscape', async () => {
    engine.setSoundscape({ music: 'theme', ambience: 'rain' });
    engine.unlock();
    await flush();
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as typeof release; }));
    engine.play('paper');
    engine.setVisible(false);
    release(response(audioAssets.paper));
    engine.setSoundscape({ music: 'tension', ambience: 'water' });
    await flush();
    const context = Context.instances[0];
    expect(context.sources).toHaveLength(2);
    expect(context.suspend).toHaveBeenCalled();
    expect(context.sources.every((source) => source.stop.mock.calls.length)).toBe(true);
    engine.setVisible(true);
    await flush();
    expect(context.sources.slice(2).map((source) => source.buffer?.id))
      .toEqual([ids[audioAssets.tension], ids[audioAssets.water]]);
  });

  it('stops rolling immediately on reveal or effects mute and drops a pending roll', async () => {
    engine.unlock();
    engine.setDiceRolling(true);
    await flush();
    const context = Context.instances[0];
    expect(context.sources[0].loop).toBe(true);
    engine.setDiceRolling(false);
    expect(context.sources[0].stop).toHaveBeenCalled();
    engine.setDiceRolling(true);
    engine.updateSettings({ effectsEnabled: false });
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.gains[1].gain.value).toBe(0);
  });

  it('retries autoplay denial on a later gesture, without loading before resume', async () => {
    engine.unlock();
    const context = Context.instances[0];
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    engine.unlock();
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it('drops failed asset loads and can retry, and remains usable without Web Audio', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    engine.setSoundscape({ music: 'theme', ambience: null });
    engine.unlock();
    await flush();
    expect(Context.instances[0].sources).toHaveLength(0);
    engine.unlock();
    await flush();
    expect(Context.instances[0].sources).toHaveLength(1);
    engine.dispose();
    vi.stubGlobal('AudioContext', undefined);
    expect(() => engine.unlock()).not.toThrow();
    expect(() => engine.play('click')).not.toThrow();
  });

  it('limits repeated clicks and disposes active/fading voices on teardown', async () => {
    engine.unlock();
    for (let i = 0; i < 20; i++) engine.play('click');
    await flush();
    const context = Context.instances[0];
    expect(context.sources).toHaveLength(1);
    engine.dispose();
    expect(context.sources[0].stop).toHaveBeenCalled();
    expect(context.sources[0].disconnect).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
});

it('maps all five visible scenes and settled endings without using secret flags or party size', () => {
  const state = { currentScene: 'S01', scenarioProgress: { endingId: null } } as GameState;
  expect(getSoundscape('title', state)).toEqual({ music: 'theme', ambience: 'rain' });
  expect(getSoundscape('setup', state)).toEqual({ music: 'theme', ambience: null });
  for (const [currentScene, music, ambience] of [
    ['S01', 'investigation', 'rain'], ['S02', 'investigation', 'rain'],
    ['S03', 'investigation', 'room'], ['S04', 'tension', 'rain'], ['S05', 'tension', 'water'],
  ] as const) expect(getSoundscape('game', { ...state, currentScene })).toEqual({ music, ambience });
  state.scenarioProgress.endingId = 'E01';
  expect(getSoundscape('game', state)).toEqual({ music: 'theme', ambience: null });
});
