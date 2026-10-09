import journal from '../../../assets/ui/artist/journal.webp';
import './journal-art.css';

export function JournalArt({ size = 20 }: { size?: number }) {
  return <img className="journal-art" src={journal} width={size} height={size}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
