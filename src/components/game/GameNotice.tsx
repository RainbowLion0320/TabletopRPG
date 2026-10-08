import './game-notice.css';

export function GameNotice({ message }: { message: string }) {
  return (
    <div className="game-notice" role="status" aria-live="polite" aria-atomic="true">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
