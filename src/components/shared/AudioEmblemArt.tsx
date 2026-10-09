import musicGramophone from '../../../assets/ui/artist/music-gramophone.webp';
import soundEmblem from '../../../assets/ui/artist/sound-emblem.webp';
import './audio-emblem-art.css';

export function AudioEmblemArt({ kind = 'sound', size = 20 }: { kind?: 'music' | 'sound'; size?: number }) {
  return <img className="audio-emblem-art" src={kind === 'music' ? musicGramophone : soundEmblem} width={size} height={size}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
