import { Dice5, Send } from 'lucide-react';
import type { GameState, SceneId } from '../../types/game';
import { sceneList, storyData } from '../../data/storyData';

interface ActionDockProps {
  state: GameState;
  onDeclarationChange: (playerId: string, text: string) => void;
  onSubmit: () => void;
  onRoll: () => void;
  onSuggestion: (text: string) => void;
  onSplitPlayerChange: (index: number) => void;
  onSplitSceneChange: (playerIndex: number, sceneId: SceneId) => void;
}

export function ActionDock({
  onDeclarationChange,
  onRoll,
  onSplitPlayerChange,
  onSplitSceneChange,
  onSubmit,
  onSuggestion,
  state
}: ActionDockProps) {
  const splitActor = state.players[state.currentSplitPlayer] ?? state.players[0];
  const togetherActor = state.players[state.currentActorIndex] ?? state.players[0];
  const togetherIsLast = state.currentActorIndex >= state.players.length - 1;

  const allFilled = state.exploreMode === 'split'
    ? Boolean(state.declarations[splitActor?.id ?? '']?.trim())
    : Boolean(state.declarations[togetherActor?.id ?? '']?.trim());

  const submitLabel = state.exploreMode === 'together'
    ? (togetherIsLast ? '提交本轮' : '下一位')
    : '提交本轮行动';

  const footerHint = state.exploreMode === 'together'
    ? (togetherIsLast
        ? '所有调查员已完成声明，提交后由 DM 统一推演本轮。'
        : `等待 ${togetherActor?.name ?? '当前调查员'} 输入行动...`)
    : '分头探索将单独结算当前调查员。';

  return (
    <section className="action-dock">
      {state.pendingCheck ? (
        <div className="check-card">
          <div>
            <strong>{state.pendingCheck.player} · {state.pendingCheck.skill}</strong>
            <span>{state.pendingCheck.difficulty}难度，阈值 {state.pendingCheck.threshold ?? '-'}</span>
            {state.pendingCheck.reason ? <small>{state.pendingCheck.reason}</small> : null}
          </div>
          <button className="secondary-action" onClick={onRoll}>
            <Dice5 size={18} />
            掷骰
          </button>
        </div>
      ) : null}

      {state.suggestions.length ? (
        <div className="suggestion-row">
          <span>建议行动</span>
          {state.suggestions.slice(0, 3).map((text) => (
            <button key={text} onClick={() => onSuggestion(text)}>{text}</button>
          ))}
        </div>
      ) : null}

      {state.exploreMode === 'split' ? (
        <div className="split-controls">
          <div className="split-tabs">
            {state.players.map((player, index) => (
              <button
                className={index === state.currentSplitPlayer ? 'active' : ''}
                key={player.id}
                onClick={() => onSplitPlayerChange(index)}
              >
                {player.name}
              </button>
            ))}
          </div>
          <div className="scene-chips">
            {sceneList.map((scene) => (
              <button
                className={state.playerLocations[splitActor.id] === scene.id ? 'active' : ''}
                key={scene.id}
                onClick={() => onSplitSceneChange(state.currentSplitPlayer, scene.id)}
              >
                {scene.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="action-input-grid">
        {state.exploreMode === 'together' ? (
          togetherActor ? (
            <label className="action-row">
              <span>{togetherActor.name}</span>
              <input
                autoFocus
                value={state.declarations[togetherActor.id] ?? ''}
                placeholder={`${togetherActor.name} 想要做什么...`}
                onChange={(event) => onDeclarationChange(togetherActor.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && allFilled && !state.isThinking) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
              />
            </label>
          ) : null
        ) : (
          <label className="action-row">
            <span>{splitActor.name}</span>
            <input
              value={state.declarations[splitActor.id] ?? ''}
              placeholder={`${splitActor.name} 在 ${storyData.scenes[state.playerLocations[splitActor.id] ?? 'S01'].name} 做什么...`}
              onChange={(event) => onDeclarationChange(splitActor.id, event.target.value)}
            />
          </label>
        )}
      </div>

      <div className="dock-footer">
        <span>{footerHint}</span>
        <button className="primary-action" disabled={!allFilled || state.isThinking} onClick={onSubmit}>
          <Send size={18} />
          {submitLabel}
        </button>
      </div>
    </section>
  );
}
