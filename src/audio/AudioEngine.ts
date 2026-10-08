import { audioAssets, type AudioAsset, type SoundEffect, type Soundscape } from './catalog';
import { loadAudioSettings, normalizeAudioSettings, saveAudioSettings, type AudioSettings } from './settings';

type Lane = 'music' | 'ambience' | 'dice';
interface Voice { source: AudioBufferSourceNode; gain: GainNode }
interface Loop extends Voice { asset: AudioAsset }

/** Sound is presentation only: failures, timing and permissions never affect game state. */
export class AudioEngine {
  private settings = loadAudioSettings();
  private subscribers = new Set<() => void>();
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private buffers = new Map<AudioAsset, Promise<AudioBuffer>>();
  private loops = new Map<Lane, Loop>();
  private retiring = new Set<Voice>();
  private effects = new Set<Voice>();
  private desired: Record<Lane, AudioAsset | null> = { music: null, ambience: null, dice: null };
  private generations: Record<Lane, number> = { music: 0, ambience: 0, dice: 0 };
  private pending: Partial<Record<Lane, AudioAsset>> = {};
  private effectGeneration = 0;
  private lastEffect = new Map<SoundEffect, number>();
  private visible = true;
  private unlocked = false;

  getSnapshot = (): AudioSettings => this.settings;
  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => { this.subscribers.delete(listener); };
  };

  updateSettings(patch: Partial<AudioSettings>): void {
    this.settings = normalizeAudioSettings({ ...this.settings, ...patch });
    saveAudioSettings(this.settings);
    this.updateVolumes();
    if (!this.settings.effectsEnabled || !this.settings.effectsVolume) this.stopEffects();
    this.sync();
    this.subscribers.forEach((listener) => listener());
  }

  /** Called directly inside a trusted pointer/keyboard gesture; retry if autoplay was denied. */
  unlock(): void {
    if (!this.visible || (!this.settings.musicEnabled && !this.settings.effectsEnabled)) return;
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        const context = this.context;
        context.onstatechange = () => {
          if (this.context !== context) return;
          if (context.state !== 'running') this.stopEffects();
          else if (this.visible) this.sync();
          else void context.suspend().catch(() => undefined);
        };
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.connect(this.context.destination);
        this.effectsBus.connect(this.context.destination);
        this.updateVolumes();
      }
      const context = this.context;
      this.unlocked = true;
      if (context.state === 'running') this.sync();
      else void context.resume().then(() => {
        if (this.context !== context) return;
        if (this.visible) this.sync();
        else void context.suspend().catch(() => undefined);
      }).catch(() => undefined);
    } catch { /* Unsupported or unavailable audio must never block a button action. */ }
  }

  setSoundscape(soundscape: Soundscape): void {
    this.desired.music = soundscape.music;
    this.desired.ambience = soundscape.ambience;
    this.sync();
  }

  setDiceRolling(rolling: boolean): void {
    this.desired.dice = rolling ? 'diceShake' : null;
    this.syncLane('dice');
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.stopEffects();
      this.stopAllLoops();
      if (this.context) void this.context.suspend().catch(() => undefined);
    } else if (this.unlocked) this.unlock();
  }

  play(effect: SoundEffect): void {
    const context = this.context;
    if (!context || !this.canPlay('ambience') || context.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastEffect.get(effect) ?? -Infinity) < 90) return;
    this.lastEffect.set(effect, now);
    const generation = this.effectGeneration;
    void this.buffer(effect).then((buffer) => {
      // Drop late interface sounds instead of playing a backlog after loading/resume.
      if (generation !== this.effectGeneration || !this.canPlay('ambience') || context.state !== 'running'
        || performance.now() - now > 800 || this.effects.size >= 6) return;
      const voice = this.voice(buffer, this.effectsBus!, effect === 'click' ? 0.7 : 1);
      this.effects.add(voice);
      voice.source.onended = () => { this.disconnect(voice); this.effects.delete(voice); };
      voice.source.start();
    }).catch(() => undefined);
  }

  /** Tear down listeners at the integration layer, then release the audio device and buffers. */
  dispose(): void {
    this.stopAllLoops();
    this.stopEffects();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.buffers.clear();
    this.unlocked = false;
  }

  private updateVolumes(): void {
    if (!this.context) return;
    // Set zero immediately, including sources fading out from an earlier scene.
    if (this.musicBus) this.musicBus.gain.value = this.settings.musicEnabled ? this.settings.musicVolume : 0;
    if (this.effectsBus) this.effectsBus.gain.value = this.settings.effectsEnabled ? this.settings.effectsVolume : 0;
  }

  private canPlay(lane: Lane): boolean {
    return this.visible && this.unlocked && (lane === 'music'
      ? this.settings.musicEnabled && this.settings.musicVolume > 0
      : this.settings.effectsEnabled && this.settings.effectsVolume > 0);
  }

  private sync(): void {
    for (const lane of ['music', 'ambience', 'dice'] as const) this.syncLane(lane);
  }

  private syncLane(lane: Lane): void {
    const asset = this.desired[lane];
    if (!asset || !this.canPlay(lane)) {
      this.generations[lane]++;
      delete this.pending[lane];
      const current = this.loops.get(lane);
      if (current) {
        if (!asset && lane !== 'dice' && this.canPlay(lane) && this.context?.state === 'running') this.fadeOut(current, 1.8);
        else this.stop(current);
        this.loops.delete(lane);
      }
      return;
    }
    if (!this.context || this.context.state !== 'running') return;
    if (this.pending[lane] && this.pending[lane] !== asset) {
      this.generations[lane]++;
      delete this.pending[lane];
    }
    if (this.loops.get(lane)?.asset === asset || this.pending[lane] === asset) return;
    const generation = ++this.generations[lane];
    this.pending[lane] = asset;
    void this.buffer(asset).then((buffer) => {
      if (generation !== this.generations[lane] || this.desired[lane] !== asset
        || !this.canPlay(lane) || this.context?.state !== 'running') return;
      const previous = this.loops.get(lane);
      const duration = lane === 'dice' ? 0.04 : 1.8;
      const voice = this.voice(buffer, lane === 'music' ? this.musicBus! : this.effectsBus!, 0);
      voice.source.loop = true;
      const targetVolume = lane === 'ambience' ? 0.45 : 1;
      voice.gain.gain.linearRampToValueAtTime(targetVolume, this.context.currentTime + duration);
      this.loops.set(lane, { ...voice, asset });
      voice.source.start();
      if (previous) this.fadeOut(previous, duration);
    }).catch(() => undefined).finally(() => {
      if (generation === this.generations[lane]) delete this.pending[lane];
    });
  }

  private buffer(asset: AudioAsset): Promise<AudioBuffer> {
    const cached = this.buffers.get(asset);
    if (cached) return cached;
    const context = this.context!;
    const promise = fetch(audioAssets[asset]).then((response) => {
      if (!response.ok) throw new Error('Audio asset unavailable');
      return response.arrayBuffer();
    }).then((data) => context.decodeAudioData(data));
    this.buffers.set(asset, promise);
    void promise.catch(() => { if (this.buffers.get(asset) === promise) this.buffers.delete(asset); });
    return promise;
  }

  private voice(buffer: AudioBuffer, bus: GainNode, volume: number): Voice {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, context.currentTime);
    source.connect(gain);
    gain.connect(bus);
    return { source, gain };
  }

  private fadeOut(voice: Voice, seconds: number): void {
    const time = this.context!.currentTime;
    if (typeof voice.gain.gain.cancelAndHoldAtTime === 'function') voice.gain.gain.cancelAndHoldAtTime(time);
    else voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.linearRampToValueAtTime(0, time + seconds);
    this.retiring.add(voice);
    voice.source.onended = () => { this.disconnect(voice); this.retiring.delete(voice); };
    voice.source.stop(time + seconds);
  }

  private disconnect(voice: Voice): void { voice.source.disconnect(); voice.gain.disconnect(); }
  private stop(voice: Voice): void {
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* It may have already ended. */ }
    this.disconnect(voice);
  }
  private stopEffects(): void {
    this.effectGeneration++;
    this.effects.forEach((voice) => this.stop(voice));
    this.effects.clear();
  }
  private stopAllLoops(): void {
    for (const lane of ['music', 'ambience', 'dice'] as const) { this.generations[lane]++; delete this.pending[lane]; }
    this.loops.forEach((voice) => this.stop(voice));
    this.retiring.forEach((voice) => this.stop(voice));
    this.loops.clear();
    this.retiring.clear();
  }
}
