import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Expand, Shrink } from 'lucide-react';
import type { GameState, NarrativeMessage } from '../../types/game';
import { storyData } from '../../data/storyData';
import {
  getPersonColor,
  markNarrativeText,
  type NarrativeMarkTarget
} from '../../services/narrativeMarkup';
import { ThinkingIndicator } from './ThinkingIndicator';
import { isPlayerVisibleMessage } from '../../services/narrativeVisibility';
import './narrative-tools.css';

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

function markIsInteractive(target: NarrativeMarkTarget): boolean {
  return target.kind === 'person'
    || target.kind === 'location'
    || target.kind === 'item'
    || target.kind === 'clue';
}

function RichNarrativeText({ message, onMarkOpen, state }: RichNarrativeTextProps) {
  const segments = markNarrativeText(
    message.text,
    state,
    message.type === 'dm' ? message.keywords : undefined,
    message.type === 'dm'
  );
  return <>{segments.map((segment, index) => {
    if (!segment.mark) return <span key={index}>{segment.text}</span>;
    const className = `narrative-mark narrative-mark-${segment.mark.kind}${segment.mark.source === 'llm' ? ' narrative-mark-inferred' : ''}`;
    if (!markIsInteractive(segment.mark)) {
      return <span className={`${className} narrative-mark-static`} key={`${index}-${segment.mark.id}`}>{segment.text}</span>;
    }
    return (
      <button
        aria-label={`查看${segment.mark.label}详情`}
        className={className}
        key={`${index}-${segment.mark.id}`}
        onClick={() => onMarkOpen?.(segment.mark!, message.text)}
        style={markStyle(segment.mark, state)}
        type="button"
      >
        {segment.text}
      </button>
    );
  })}</>;
}

export function NarrativePanel({ onMarkOpen, state }: NarrativePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const previousLatestId = useRef<string | undefined>(undefined);
  const previousLatestStart = useRef(0);
  const scrollId = useId();
  const [expanded, setExpanded] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const visibleMessages = state.messages.filter(isPlayerVisibleMessage);
  const latestId = visibleMessages[visibleMessages.length - 1]?.id;

  useLayoutEffect(() => {
    const panel = ref.current;
    const latest = latestMessageRef.current;
    if (!panel || !latest) return;
    const previousId = previousLatestId.current;
    // Replacing the history (loading a save) starts reading its latest entry.
    const replaced = previousId !== undefined && !visibleMessages.some(message => message.id === previousId);
    // Scroll events can arrive after a model reply. Read the actual position against
    // the preceding entry's start before moving anything, rather than a stale flag.
    const followLatest = previousId === undefined || replaced || panel.scrollTop >= previousLatestStart.current - 12;
    previousLatestStart.current = Math.min(latest.offsetTop, Math.max(0, panel.scrollHeight - panel.clientHeight));
    if (previousId === latestId) return;
    previousLatestId.current = latestId;
    if (followLatest) {
      panel.scrollTo({ top: latest.offsetTop, behavior: 'auto' });
      setHasNewContent(false);
    } else {
      setHasNewContent(true);
    }
  }, [latestId, visibleMessages]);

  function handleScroll() {
    const panel = ref.current, latest = latestMessageRef.current;
    if (!panel || !latest) return;
    // A long latest reply is followed from its beginning, not its final line.
    const latestStart = Math.min(latest.offsetTop, Math.max(0, panel.scrollHeight - panel.clientHeight));
    previousLatestStart.current = latestStart;
    if (panel.scrollTop >= latestStart - 12) setHasNewContent(false);
  }

  function readNewContent() {
    const panel = ref.current, latest = latestMessageRef.current;
    if (!panel || !latest) return;
    panel.scrollTo({ top: latest.offsetTop, behavior: 'auto' });
    setHasNewContent(false);
    panel.focus({ preventScroll: true });
  }

  const activeNpc = state.activeNpcName ? storyData.npcs[state.activeNpcName] : null;

  return (
    <div className={`narrative-panel${expanded ? ' expanded' : ''}`}>
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
            title={`${state.activeNpcName} · ${activeNpc.role}`}
            type="button"
          >
            <strong>{state.activeNpcName}</strong><span className="npc-role">{activeNpc.role}</span>
          </button>
        ) : (
          <div className="narrative-title">对话记录</div>
        )}
        <div className="narrative-tools">
          {hasNewContent && <button className="narrative-new-content" onClick={readNewContent} aria-label="查看新剧情" aria-controls={scrollId} type="button"><ChevronDown size={14} />新内容</button>}
          <button
            className="narrative-toggle-btn"
            aria-label={expanded ? '收起剧情' : '展开剧情'}
            aria-expanded={expanded}
            aria-controls={scrollId}
            onClick={() => setExpanded(!expanded)}
            title={expanded ? '收起' : '展开'}
            type="button"
          >
            {expanded ? <Shrink size={16} /> : <Expand size={16} />}
          </button>
        </div>
      </div>
      <div className="narrative-scroll" id={scrollId} ref={ref} role="region" aria-label="剧情记录" onScroll={handleScroll} tabIndex={0}>
        {visibleMessages.map((message, index) => (
          <div
            className={`story-message ${message.type}`}
            key={message.id}
            data-message-id={message.id}
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
    </div>
  );
}
