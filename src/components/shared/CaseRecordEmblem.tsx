import person from '../../../assets/ui/artist/record-person.webp';
import place from '../../../assets/ui/artist/record-place.webp';
import './case-record-emblem.css';

/** Category artwork stays separate from a known person's actual portrait. */
export function CaseRecordEmblem({ kind }: { kind: 'person' | 'place' }) {
  return <img className="case-record-emblem-art" src={kind === 'person' ? person : place} alt="" aria-hidden="true"
    width={128} height={128} draggable={false} decoding="async" />;
}
