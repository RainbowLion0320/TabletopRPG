import homeEmblem from '../../../assets/ui/artist/home-emblem.webp';
import './home-emblem-art.css';

export function HomeEmblemArt({ size = 20 }: { size?: number }) {
  return <img className="home-emblem-art" src={homeEmblem} width={size} height={size}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
