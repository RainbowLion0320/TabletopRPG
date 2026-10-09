import archiveEmpty from '../../../assets/ui/artist/archive-empty.webp';
import './archive-empty-art.css';

export function ArchiveEmptyArt() {
  return <img className="archive-empty-art" src={archiveEmpty} alt="" aria-hidden="true"
    draggable={false} decoding="async" width={112} height={72} />;
}
