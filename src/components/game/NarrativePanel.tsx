import { useEffect, useRef, useState } from 'react';
import { Expand, Shrink } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';

interface NarrativePanelProps {
  state: GameState;
}

export function NarrativePanel({ state }: NarrativePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length]);

  const activeNpc = state.activeNpcName ? storyData.npcs[state.activeNpcName] : null;

  return (
    <div className={`narrative-panel${expanded ? ' expanded' : ''}`} ref={ref}>
      <div className="narrative-header">
        {activeNpc ? (
          <div className="npc-nameplate">{state.activeNpcName} · {activeNpc.role}</div>
        ) : (
          <div className="narrative-title">对话记录</div>
        )}
        <button
          className="narrative-toggle-btn"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? '收起' : '展开'}
          type="button"
        >
          {expanded ? <Shrink size={16} /> : <Expand size={16} />}
        </button>
      </div>
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
