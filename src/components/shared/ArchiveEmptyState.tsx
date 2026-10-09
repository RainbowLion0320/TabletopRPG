import { ArchiveEmptyArt } from './ArchiveEmptyArt';
import './archive-empty-state.css';

export function ArchiveEmptyState({ children, className = '' }: { children: string; className?: string }) {
  return <div className={`archive-empty-state ${className}`} role="status">
    <ArchiveEmptyArt /><p>{children}</p>
  </div>;
}
