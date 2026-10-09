import archiveFile from '../../../assets/ui/artist/archive-file.webp';
import archiveTheory from '../../../assets/ui/artist/archive-theory.webp';
import './archive-record-art.css';

export function ArchiveRecordArt({ kind }: { kind: 'file' | 'theory' }) {
  return <img className="archive-record-art" src={kind === 'theory' ? archiveTheory : archiveFile} alt="" aria-hidden="true"
    draggable={false} decoding="async" width={64} height={96} />;
}
