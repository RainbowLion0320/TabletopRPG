import { memo, useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { ChevronDown, Expand, Shrink } from 'lucide-react';
import type { GameState, NarrativeKeywordHint, NarrativeMessage } from '../../types/game';
import { storyData } from '../../data/storyData';
import {
  createNarrativeMarkup,
  type NarrativeMarkup,
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
  text: string;
  keywords?: NarrativeKeywordHint[];
  keywordsKey?: string;
  includeLlmKeywords: boolean;
  markup: NarrativeMarkup;
  onMarkOpen?: NarrativePanelProps['onMarkOpen'];
}

function markStyle(target: NarrativeMarkTarget, markup: NarrativeMarkup): CSSProperties | undefined {
  if (target.kind !== 'person') return undefined;
  return {
    '--person-color': markup.personColor(target.canonicalName ?? target.label)
  } as CSSProperties;
}

function markIsInteractive(target: NarrativeMarkTarget): boolean {
  return target.kind === 'person'
    || target.kind === 'location'
    || target.kind === 'item'
    || target.kind === 'clue';
}

const RichNarrativeText = memo(function RichNarrativeText({ text, keywords, includeLlmKeywords, onMarkOpen, markup }: RichNarrativeTextProps) {
  const segments = markup.markText(
    text,
    keywords,
    includeLlmKeywords
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
        onClick={() => onMarkOpen?.(segment.mark!, text)}
        style={markStyle(segment.mark, markup)}
        type="button"
      >
        {segment.text}
      </button>
    );
  })}</>;
}, (before, after) => before.text === after.text
  && before.keywordsKey === after.keywordsKey
  && before.includeLlmKeywords === after.includeLlmKeywords
  && before.markup.signature === after.markup.signature
  && before.onMarkOpen === after.onMarkOpen);

interface StoryMessageProps {
  id: string;
  type: NarrativeMessage['type'];
  text: string;
  playerName?: string;
  playerId?: string;
  keywords?: NarrativeKeywordHint[];
  keywordsKey?: string;
  markup: NarrativeMarkup;
  onMarkOpen: NonNullable<NarrativePanelProps['onMarkOpen']>;
  elementRef?: Ref<HTMLDivElement>;
}

const StoryMessage = memo(function StoryMessage({ id, type, text, playerName, playerId, keywords, keywordsKey, markup, onMarkOpen, elementRef }: StoryMessageProps) {
  const richText = <RichNarrativeText text={text} keywords={keywords} keywordsKey={keywordsKey}
    includeLlmKeywords={type === 'dm'} onMarkOpen={onMarkOpen} markup={markup} />;
  return <div className={`story-message ${type}`} data-message-id={id} ref={elementRef}>
    {type === 'dm' ? <div className="message-label">AI DM</div> : null}
    {type === 'player' ? <p className="player-message-line">
      <button aria-label={`查看${playerName ?? '玩家'}详情`} className="player-inline-name narrative-mark narrative-mark-person"
        onClick={() => {
          if (!playerId || !playerName) return;
          onMarkOpen({ kind: 'person', id: playerId, label: playerName, source: 'deterministic', canonicalName: playerName }, text);
        }} style={{ '--person-color': markup.personColor(playerName ?? '玩家') } as CSSProperties} type="button">
        {playerName ?? '玩家'}
      </button>
      <span className="player-inline-separator">：</span>
      <span className="player-message-text">{richText}</span>
    </p> : <p>{richText}</p>}
  </div>;
}, (before, after) => before.id === after.id && before.type === after.type && before.text === after.text
  && before.playerName === after.playerName && before.playerId === after.playerId
  && before.keywordsKey === after.keywordsKey && before.markup.signature === after.markup.signature
  && before.onMarkOpen === after.onMarkOpen && before.elementRef === after.elementRef);

export function NarrativePanel({ onMarkOpen, state }: NarrativePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const previousLatestId = useRef<string | undefined>(undefined);
  const previousLatestStart = useRef(0);
  const onMarkOpenRef = useRef(onMarkOpen);
  const scrollId = useId();
  const [expanded, setExpanded] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const visibleMessages = state.messages.filter(isPlayerVisibleMessage);
  const latestId = visibleMessages[visibleMessages.length - 1]?.id;
  const markup = createNarrativeMarkup(state);

  // Cached prose uses the latest committed callback when opening live details.
  useLayoutEffect(() => { onMarkOpenRef.current = onMarkOpen; });
  const openMark = useCallback<NonNullable<NarrativePanelProps['onMarkOpen']>>(
    (target, sourceText) => onMarkOpenRef.current?.(target, sourceText), []
  );

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
            style={{ '--person-color': markup.personColor(state.activeNpcName!) } as CSSProperties}
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
        {visibleMessages.map((message, index) => {
          const keywords = message.type === 'dm' ? message.keywords : undefined;
          // A primitive snapshot also notices in-place hint changes on old records.
          return <StoryMessage key={message.id} id={message.id} type={message.type} text={message.text}
            playerName={message.playerName} playerId={state.players.find((player) => player.name === message.playerName)?.id}
            keywords={keywords} keywordsKey={keywords?.length ? JSON.stringify(keywords) : undefined}
            markup={markup} onMarkOpen={openMark} elementRef={index === visibleMessages.length - 1 ? latestMessageRef : undefined} />;
        })}
      </div>
      {state.isThinking ? <ThinkingIndicator /> : null}
    </div>
  );
}
