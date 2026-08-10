import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Expand, Shrink } from 'lucide-react';
import type { GameState, NarrativeMessage } from '../../types/game';
import { storyData } from '../../data/storyData';
import {
  getPersonColor,
  markNarrativeText,
  type NarrativeMarkTarget
} from '../../services/narrativeMarkup';
import { ThinkingIndicator } from './ThinkingIndicator';

interface NarrativePanelProps {
  state: GameState;
  onMarkOpen?: (target: NarrativeMarkTarget, sourceText: string) => void;
}

interface RichNarrativeTextProps {
  message: NarrativeMessage;
  state: GameState;
  onMarkOpen?: NarrativePanelProps['onMarkOpen'];
}

function markStyle(target: NarrativeMarkTarget, state: GameState): CSSProperties | undefined {
  if (target.kind !== 'person') return undefined;
  return {
    '--person-color': getPersonColor(state, target.canonicalName ?? target.label)
  } as CSSProperties;
}

function RichNarrativeText({ message, onMarkOpen, state }: RichNarrativeTextProps) {
  const segments = markNarrativeText(
    message.text,
    state,
    message.type === 'dm' ? message.keywords : undefined,
    message.type === 'dm'
  );
  return <>{segments.map((segment, index) => segment.mark ? (
    <button
      aria-label={`查看${segment.mark.label}详情`}
      className={`narrative-mark narrative-mark-${segment.mark.kind}${segment.mark.source === 'llm' ? ' narrative-mark-inferred' : ''}`}
      key={`${index}-${segment.mark.id}`}
      onClick={() => onMarkOpen?.(segment.mark!, message.text)}
      style={markStyle(segment.mark, state)}
      type="button"
    >
      {segment.text}
    </button>
  ) : <span key={index}>{segment.text}</span>)}</>;
}

export function NarrativePanel({ onMarkOpen, state }: NarrativePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const visibleMessages = state.messages.filter((message) =>
    !(message.type === 'system' && /^推进提示[：:]/.test(message.text.trim()))
  );

  useEffect(() => {
    const panel = ref.current;
    const latest = latestMessageRef.current;
    if (!panel || !latest) return;
    panel.scrollTo({ top: Math.max(0, latest.offsetTop - 56), behavior: 'smooth' });
  }, [state.messages.length]);

  const activeNpc = state.activeNpcName ? storyData.npcs[state.activeNpcName] : null;

  return (
    <div className={`narrative-panel${expanded ? ' expanded' : ''}`} ref={ref}>
      <div className="narrative-header">
        {activeNpc ? (
          <button
            aria-label={`查看${state.activeNpcName}详情`}
            className="npc-nameplate"
            onClick={() => onMarkOpen?.({
              kind: 'person',
              id: state.activeNpcName!,
              label: state.activeNpcName!,
              source: 'deterministic',
              canonicalName: state.activeNpcName!
            }, state.activeNpcName!)}
            style={{ '--person-color': getPersonColor(state, state.activeNpcName!) } as CSSProperties}
            type="button"
          >
            <strong>{state.activeNpcName}</strong><span> · {activeNpc.role}</span>
          </button>
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
      {visibleMessages.map((message, index) => (
        <div
          className={`story-message ${message.type}`}
          key={message.id}
          ref={index === visibleMessages.length - 1 ? latestMessageRef : undefined}
        >
          {message.type === 'dm' ? <div className="message-label">AI DM</div> : null}
          {message.type === 'player' ? (
            <p className="player-message-line">
              <button
                aria-label={`查看${message.playerName ?? '玩家'}详情`}
                className="player-inline-name narrative-mark narrative-mark-person"
                onClick={() => {
                  const player = state.players.find((item) => item.name === message.playerName);
                  if (!player) return;
                  onMarkOpen?.({
                    kind: 'person', id: player.id, label: player.name, source: 'deterministic', canonicalName: player.name
                  }, message.text);
                }}
                style={{ '--person-color': getPersonColor(state, message.playerName ?? '玩家') } as CSSProperties}
                type="button"
              >
                {message.playerName ?? '玩家'}
              </button>
              <span className="player-inline-separator">：</span>
              <span className="player-message-text"><RichNarrativeText message={message} onMarkOpen={onMarkOpen} state={state} /></span>
            </p>
          ) : (
            <p><RichNarrativeText message={message} onMarkOpen={onMarkOpen} state={state} /></p>
          )}
        </div>
      ))}
      {state.isThinking ? <ThinkingIndicator /> : null}
    </div>
  );
}
