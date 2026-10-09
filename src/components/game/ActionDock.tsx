import { useEffect, useLayoutEffect, useRef } from 'react';
import { Dice5, Flag, Home, Send } from 'lucide-react';
import { JournalArt } from '../shared/JournalArt';
import type { GameState } from '../../types/game';
import { getScenarioDefinition, getScenarioProgressForState } from '../../scenario/engine';
import { pendingDmFailureText } from '../../services/narrativeVisibility';
import './ending-dock.css';
import './turn-prompt.css';
import './party-status.css';
import './action-controls.css';

interface ActionDockProps {
  autoFocusInput?: boolean;
  portrait?: boolean;
  isDiceRolling: boolean;
  state: GameState;
  onDeclarationChange: (playerId: string, text: string) => void;
  onSubmit: () => void;
  onRoll: () => void;
  onSuggestion: (text: string) => void;
  onInspectPlayer: (playerId: string) => void;
  onRetry?: () => void;
  onReview?: () => void;
  onHome?: () => void;
}

export function ActionDock({
  autoFocusInput = true,
  portrait = false,
  isDiceRolling,
  onDeclarationChange,
  onRoll,
  onSubmit,
  onSuggestion,
  onRetry,
  onInspectPlayer,
  onReview,
  onHome,
  state
}: ActionDockProps) {
  const currentActor = state.players[state.currentActorIndex] ?? state.players[0];
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const declaration = state.declarations[currentActor?.id ?? ''] ?? '';
  const isLastActor = state.currentActorIndex >= state.players.length - 1;
  const currentSuggestions = currentActor
    ? state.suggestionsByPlayerId[currentActor.id] ?? state.suggestions
    : state.suggestions;

  const allFilled = Boolean(declaration.trim());
  const submitLabel = isLastActor ? '提交' : '下一位';
  const scenario = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const ending = scenario.progression.endings.find((item) => item.id === progress.endingId);
  const hasPendingTurn = Boolean(state.pendingDmActions?.length);
  const canDeclare = !ending && !isDiceRolling && !state.isThinking && !hasPendingTurn && !state.pendingCheck;

  useLayoutEffect(() => {
    if (inputRef.current) fitActionInput(inputRef.current);
  }, [declaration, currentActor?.id, portrait]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let width = input.clientWidth;
    let resizeFrame: number | undefined;
    const resize = () => { fitActionInput(input); width = input.clientWidth; };
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      // Refit a changed wrapping width after observation, not inside its delivery.
      if (input.clientWidth > 0 && input.clientWidth !== width) {
        width = input.clientWidth;
        resizeFrame ??= requestAnimationFrame(() => {
          resizeFrame = undefined;
          if (input.isConnected && input.clientWidth > 0) resize();
        });
      }
    });
    observer?.observe(input);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    };
  }, [currentActor?.id]);

  if (ending) {
    return (
      <section className="action-dock ending-dock" aria-label="游戏结局">
        <div className="ending-copy"><Flag size={18} aria-hidden="true" /><div><strong>{ending.title}</strong><p>{ending.summary}</p></div></div>
        {(onReview || onHome) && <nav className="ending-actions" aria-label="结案操作">
          {onReview && <button type="button" className="primary-action" aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onReview(); }}><JournalArt />调查回顾</button>}
          {onHome && <button type="button" className="secondary-action" onClick={onHome}><Home size={16} aria-hidden="true" />返回首页</button>}
        </nav>}
        <PartyStatusStrip state={state} canDeclare={false} onInspectPlayer={onInspectPlayer} />
      </section>
    );
  }

  return (
    <section className="action-dock">
      {hasPendingTurn && !state.isThinking && !state.pendingCheck ? (
        <div className="check-card" role="status">
          <div><strong>本轮行动已保留</strong><span>{pendingDmFailureText(state.messages) ?? '继续本轮，已确认的骰点无需重掷。'}</span></div>
          <button className="secondary-action" onClick={onRetry}>重试本轮</button>
        </div>
      ) : null}
      {/* 条件区域：检定 / 建议 */}
      {state.pendingCheck ? (
        <div className="check-card">
          <div>
            <strong>{state.pendingCheck.player} · {state.pendingCheck.skill}</strong>
            <span>
              {state.pendingCheck.batchTotal && state.pendingCheck.batchTotal > 1
                ? `本轮第 ${state.pendingCheck.batchIndex ?? 1}/${state.pendingCheck.batchTotal} 个 · `
                : ''}
              难度：{state.pendingCheck.difficulty}，阈值 {state.pendingCheck.threshold ?? '-'}
            </span>
          </div>
          <button className="secondary-action" disabled={isDiceRolling || state.isThinking} onClick={onRoll}>
            <Dice5 size={16} aria-hidden="true" />
            {isDiceRolling ? '掷骰中' : '掷骰'}
          </button>
        </div>
      ) : null}

      {!hasPendingTurn && !state.pendingCheck && !state.isThinking && currentSuggestions.length ? (
        <div className="suggestion-row">
          {currentSuggestions.slice(0, 3).map((text) => (
            <button key={text} onClick={() => onSuggestion(text)}>{text}</button>
          ))}
        </div>
      ) : null}

      {/* 第一行：当前角色头像+名 + 输入框 + 提交按钮 */}
      <div className="dock-input-row">
        {currentActor ? (
          <>
            <div className="dock-actor-label">
              <button className="dock-actor-avatar" type="button" aria-label={`查看${currentActor.name}的属性`} aria-haspopup="dialog" title="查看调查员档案" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onInspectPlayer(currentActor.id); }}>
                {currentActor.portrait ? <img src={currentActor.portrait} alt="" /> : <span>{currentActor.name.slice(0, 1)}</span>}
              </button>
              <span>{currentActor.name}</span>
            </div>
            <textarea
              className="dock-input"
              ref={inputRef}
              rows={1}
              aria-label={`${currentActor.name}的行动`}
              enterKeyHint={portrait ? 'enter' : 'send'}
              autoFocus={autoFocusInput}
              disabled={!canDeclare}
              value={declaration}
              placeholder={portrait ? '描述你的行动…' : `${currentActor.name} 想要做什么...`}
              onChange={(event) => onDeclarationChange(currentActor.id, event.target.value)}
              onKeyDown={(event) => {
                if (!portrait && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229
                  && !event.repeat && allFilled && !isDiceRolling && !state.isThinking && !hasPendingTurn && !state.pendingCheck) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
            />
          </>
        ) : null}
        <button className="primary-action dock-submit" disabled={!allFilled || !canDeclare} onClick={() => {
          if (!isLastActor) inputRef.current?.focus({ preventScroll: true });
          onSubmit();
        }}>
          <Send size={16} />
          {submitLabel}
        </button>
      </div>

      {/* Party resources also open each investigator's existing dossier. */}
      <PartyStatusStrip state={state} canDeclare={canDeclare} onInspectPlayer={onInspectPlayer} />
    </section>
  );
}

function PartyStatusStrip({ state, canDeclare, onInspectPlayer }: Pick<ActionDockProps, 'state' | 'onInspectPlayer'> & { canDeclare: boolean }) {
  return <div className="party-strip-compact">
        {state.players.map((player, index) => {
          const hpPct = player.hp > 0 ? Math.round((player.currentHp / player.hp) * 100) : 0;
          const sanPct = player.san > 0 ? Math.round((player.currentSan / player.san) * 100) : 0;
          const isActiveActor = canDeclare && index === state.currentActorIndex;
          const hasActed = canDeclare && index < state.currentActorIndex;
          const status = state.players.length > 1 ? (isActiveActor ? '行动中' : hasActed ? '已提交' : '') : '';
          const cardClass = `party-compact${isActiveActor ? ' active' : ''}${hasActed ? ' acted' : ''}`;
          return (
            <button
              className={cardClass}
              key={player.id}
              type="button"
              aria-label={`查看${player.name}的属性，生命 ${player.currentHp}/${player.hp}，理智 ${player.currentSan}/${player.san}${status ? `，${status}` : ''}`}
              aria-haspopup="dialog"
              aria-current={status === '行动中' ? 'step' : undefined}
              onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onInspectPlayer(player.id); }}
              title={`${player.name} ${player.job} | 生命 (HP) ${player.currentHp}/${player.hp} | 理智 (SAN) ${player.currentSan}/${player.san}`}
            >
              <span className="party-compact-heading"><strong>{player.name}</strong>{status && <span className="party-action-status">{status}</span>}</span>
              <span className="party-compact-bars">
                <span className="party-resource">
                  <span className="bar-label hp">生命</span>
                  <span className="mini-bar" aria-hidden="true"><i style={{ width: `${hpPct}%` }} /></span>
                  <span className="bar-value">{player.currentHp}/{player.hp}</span>
                </span>
                <span className="party-resource">
                  <span className="bar-label san">理智</span>
                  <span className="mini-bar" aria-hidden="true"><i className="san" style={{ width: `${sanPct}%` }} /></span>
                  <span className="bar-value">{player.currentSan}/{player.san}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>;
}

/** Keep short actions compact and long descriptions scrollable within the dock. */
function fitActionInput(input: HTMLTextAreaElement) {
  const style = getComputedStyle(input);
  const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const minHeight = parseFloat(style.minHeight) || 44;
  const maxHeight = parseFloat(style.maxHeight) || 104;
  if (!input.value) { input.style.height = `${minHeight}px`; return; }
  input.style.height = '0px';
  input.style.height = `${Math.min(maxHeight, Math.max(minHeight, input.scrollHeight + border))}px`;
}
