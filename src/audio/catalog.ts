import type { GameState } from '../types/game';

export const audioAssets = {
  theme: new URL('../../assets/audio/music/fog-theme.mp3', import.meta.url).href,
  investigation: new URL('../../assets/audio/music/quiet-investigation.mp3', import.meta.url).href,
  tension: new URL('../../assets/audio/music/approaching-darkness.mp3', import.meta.url).href,
  rain: new URL('../../assets/audio/ambience/rain-window.mp3', import.meta.url).href,
  room: new URL('../../assets/audio/ambience/old-room.mp3', import.meta.url).href,
  water: new URL('../../assets/audio/ambience/harbor-water.mp3', import.meta.url).href,
  click: new URL('../../assets/audio/sfx/interface-click.mp3', import.meta.url).href,
  paper: new URL('../../assets/audio/sfx/paper-open.mp3', import.meta.url).href,
  diceShake: new URL('../../assets/audio/sfx/dice-shake.mp3', import.meta.url).href,
  diceLand: new URL('../../assets/audio/sfx/dice-land.mp3', import.meta.url).href,
  success: new URL('../../assets/audio/sfx/check-success.mp3', import.meta.url).href,
  failure: new URL('../../assets/audio/sfx/check-failure.mp3', import.meta.url).href,
} as const;

export type AudioAsset = keyof typeof audioAssets;
export type SoundEffect = 'click' | 'paper' | 'diceLand' | 'success' | 'failure';
export interface Soundscape { music: AudioAsset; ambience: AudioAsset | null }

/** Use only the current visible scene and a settled ending, never DM secrets. */
export function getSoundscape(screen: 'title' | 'setup' | 'game', state: Pick<GameState, 'currentScene' | 'scenarioProgress'>): Soundscape {
  if (screen !== 'game') return { music: 'theme', ambience: screen === 'title' ? 'rain' : null };
  if (state.scenarioProgress?.endingId) return { music: 'theme', ambience: null };
  switch (state.currentScene) {
    case 'S03': return { music: 'investigation', ambience: 'room' };
    case 'S04': return { music: 'tension', ambience: 'rain' };
    case 'S05': return { music: 'tension', ambience: 'water' };
    default: return { music: 'investigation', ambience: 'rain' };
  }
}
