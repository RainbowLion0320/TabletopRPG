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
  const allFilled = state.exploreMode === 'split'
    ? Boolean(state.declarations[state.players[state.currentSplitPlayer]?.id])
    : state.players.every((player) => state.declarations[player.id]?.trim());
  const activePlayer = state.players[state.currentSplitPlayer] ?? state.players[0];

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
                className={state.playerLocations[activePlayer.id] === scene.id ? 'active' : ''}
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
          state.players.map((player) => (
            <label className="action-row" key={player.id}>
              <span>{player.name}</span>
              <input
                value={state.declarations[player.id] ?? ''}
                placeholder={`${player.name} 想要做什么...`}
                onChange={(event) => onDeclarationChange(player.id, event.target.value)}
              />
            </label>
          ))
        ) : (
          <label className="action-row">
            <span>{activePlayer.name}</span>
            <input
              value={state.declarations[activePlayer.id] ?? ''}
              placeholder={`${activePlayer.name} 在 ${storyData.scenes[state.playerLocations[activePlayer.id] ?? 'S01'].name} 做什么...`}
              onChange={(event) => onDeclarationChange(activePlayer.id, event.target.value)}
            />
          </label>
        )}
      </div>

      <div className="dock-footer">
        <span>{state.exploreMode === 'together' ? '等待所有玩家输入行动...' : '分头探索将单独结算当前调查员。'}</span>
        <button className="primary-action" disabled={!allFilled || state.isThinking} onClick={onSubmit}>
          <Send size={18} />
          提交本轮行动
        </button>
      </div>
    </section>
  );
}
