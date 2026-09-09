import { gameStorage } from '../platform/storage';

export interface AudioSettings {
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
}

export const AUDIO_SETTINGS_KEY = 'trpg-audio-v1';
export const defaultAudioSettings: AudioSettings = {
  musicEnabled: true, effectsEnabled: true, musicVolume: 0.3, effectsVolume: 0.55,
};

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const input = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value)) : fallback;
  return {
    musicEnabled: typeof input.musicEnabled === 'boolean' ? input.musicEnabled : defaultAudioSettings.musicEnabled,
    effectsEnabled: typeof input.effectsEnabled === 'boolean' ? input.effectsEnabled : defaultAudioSettings.effectsEnabled,
    musicVolume: volume(input.musicVolume, defaultAudioSettings.musicVolume),
    effectsVolume: volume(input.effectsVolume, defaultAudioSettings.effectsVolume),
  };
}

export function loadAudioSettings(): AudioSettings {
  try { return normalizeAudioSettings(JSON.parse(gameStorage.getItem(AUDIO_SETTINGS_KEY) ?? 'null')); }
  catch { return { ...defaultAudioSettings }; }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try { gameStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Audio controls still work when browser storage is unavailable. */ }
}
