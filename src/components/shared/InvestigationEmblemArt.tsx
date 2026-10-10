import lens from '../../../assets/ui/artist/investigation-lens.webp';
import watch from '../../../assets/ui/artist/pocket-watch.webp';
import seal from '../../../assets/ui/artist/case-seal.webp';
import './investigation-emblem-art.css';

const artwork = { lens, clock: watch, seal };

export function InvestigationEmblemArt({ kind = 'lens', size = 24 }: { kind?: keyof typeof artwork; size?: number }) {
  return <img className="investigation-emblem-art" src={artwork[kind]} width={size} height={size}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
