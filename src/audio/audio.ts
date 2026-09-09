import { AudioEngine } from './AudioEngine';

export const gameAudio = new AudioEngine();
if (import.meta.hot) import.meta.hot.dispose(() => gameAudio.dispose());
