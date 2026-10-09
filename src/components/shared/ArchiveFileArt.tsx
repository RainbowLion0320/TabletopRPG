import archiveFile from '../../../assets/ui/artist/archive-file.webp';
import './archive-file-art.css';

export function ArchiveFileArt() {
  return <img className="archive-file-art" src={archiveFile} alt="" aria-hidden="true"
    draggable={false} decoding="async" width={64} height={96} />;
}
