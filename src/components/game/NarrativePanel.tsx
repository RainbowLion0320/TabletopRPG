import { useEffect, useRef } from 'react';
import type { GameState } from '../../types/game';

interface NarrativePanelProps {
  state: GameState;
}

export function NarrativePanel({ state }: NarrativePanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length]);

  return (
    <div className="narrative-panel" ref={ref}>
      {state.messages.map((message) => (
        <div className={`story-message ${message.type}`} key={message.id}>
          {message.type === 'dm' ? <div className="message-label">AI DM</div> : null}
          {message.type === 'player' ? <div className="message-label">{message.playerName}</div> : null}
          <p>{message.text}</p>
        </div>
      ))}
      {state.isThinking ? <div className="thinking-line">AI DM 正在推演下一幕...</div> : null}
    </div>
  );
}
