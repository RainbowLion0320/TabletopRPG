import { Dice5, Flag, Send } from 'lucide-react';
import type { GameState, SceneId } from '../../types/game';
import { sceneList, storyData } from '../../data/storyData';
import { getAvailableSceneExits, getScenarioDefinition, getScenarioProgressForState } from '../../scenario/engine';

interface ActionDockProps {
  isDiceRolling: boolean;
  state: GameState;
  onActorChange: (index: number) => void;
  onDeclarationChange: (playerId: string, text: string) => void;
  onSubmit: () => void;
  onRoll: () => void;
  onSuggestion: (text: string) => void;
  onSplitPlayerChange: (index: number) => void;
  onSplitSceneChange: (playerIndex: number, sceneId: SceneId) => void;
}

export function ActionDock({
  isDiceRolling,
  onActorChange,
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

  const currentActor = state.exploreMode === 'split' ? splitActor : togetherActor;
  const currentSuggestions = currentActor
    ? state.suggestionsByPlayerId[currentActor.id] ?? state.suggestions
    : state.suggestions;

  const allFilled = state.exploreMode === 'split'
    ? Boolean(state.declarations[splitActor?.id ?? '']?.trim())
    : Boolean(state.declarations[togetherActor?.id ?? '']?.trim());

  const submitLabel = state.exploreMode === 'together'
    ? (togetherIsLast ? '提交' : '下一位')
    : '提交';
  const scenario = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const ending = scenario.progression.endings.find((item) => item.id === progress.endingId);
  const splitLocation = state.playerLocations[splitActor?.id ?? ''] ?? state.currentScene;
  const splitSceneIds = new Set([
    splitLocation,
    ...getAvailableSceneExits(progress, splitLocation).map((exit) => exit.sceneId)
  ]);

  if (ending) {
    return (
      <section className="action-dock ending-dock" aria-label="游戏结局">
        <Flag size={20} />
        <div><strong>{ending.title}</strong><p>{ending.summary}</p></div>
      </section>
    );
  }

  return (
    <section className="action-dock">
      {/* 条件区域：检定 / 建议 / 分头控制 */}
      {state.pendingCheck ? (
        <div className="check-card">
          <div>
            <strong>{state.pendingCheck.player} · {state.pendingCheck.skill}</strong>
            <span>难度：{state.pendingCheck.difficulty}，阈值 {state.pendingCheck.threshold ?? '-'}</span>
          </div>
          <button className="secondary-action" disabled={isDiceRolling || state.isThinking} onClick={onRoll}>
            <Dice5 size={16} />
            {isDiceRolling ? '掷骰中' : '掷骰'}
          </button>
        </div>
      ) : null}

      {!state.pendingCheck && currentSuggestions.length ? (
        <div className="suggestion-row">
          {currentSuggestions.slice(0, 3).map((text) => (
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
            {sceneList.filter((scene) => splitSceneIds.has(scene.id)).map((scene) => (
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

      {/* 第一行：当前角色头像+名 + 输入框 + 提交按钮 */}
      <div className="dock-input-row">
        {currentActor ? (
          <>
            <div className="dock-actor-label">
              <div className="dock-actor-avatar">
                {currentActor.portrait ? <img src={currentActor.portrait} alt="" /> : <span>{currentActor.name.slice(0, 1)}</span>}
              </div>
              <span>{currentActor.name}</span>
            </div>
            <input
              className="dock-input"
              autoFocus
              disabled={isDiceRolling}
              value={state.declarations[currentActor.id] ?? ''}
              placeholder={`${currentActor.name} 想要做什么...`}
              onChange={(event) => onDeclarationChange(currentActor.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && allFilled && !state.isThinking) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
            />
          </>
        ) : null}
        <button className="primary-action dock-submit" disabled={!allFilled || state.isThinking || isDiceRolling} onClick={onSubmit}>
          <Send size={16} />
          {submitLabel}
        </button>
      </div>

      {/* 第二行：全部角色紧凑信息条（名 + HP + SAN 同行） */}
      <div className="party-strip-compact">
        {state.players.map((player, index) => {
          const hpPct = Math.round((player.currentHp / player.hp) * 100);
          const sanPct = Math.round((player.currentSan / player.san) * 100);
          const isActiveActor = state.exploreMode === 'together' && index === state.currentActorIndex;
          const hasActed = state.exploreMode === 'together' && index < state.currentActorIndex;
          const isSplitActor = state.exploreMode === 'split' && index === state.currentSplitPlayer;
          const cardClass = `party-compact${isActiveActor || isSplitActor ? ' active' : ''}${hasActed ? ' acted' : ''}`;
          return (
            <button
              className={cardClass}
              key={player.id}
              onClick={() => state.exploreMode === 'together' ? onActorChange(index) : onSplitPlayerChange(index)}
              type="button"
              title={`${player.name} ${player.job} | HP ${player.currentHp}/${player.hp} | SAN ${player.currentSan}/${player.san}`}
            >
              <strong>{player.name}</strong>
              <div className="party-compact-bars">
                <span className="bar-label hp">HP</span>
                <div className="mini-bar"><i style={{ width: `${hpPct}%` }} /></div>
                <span className="bar-value">{player.currentHp}/{player.hp}</span>
                <span className="bar-label san">SAN</span>
                <div className="mini-bar"><i className="san" style={{ width: `${sanPct}%` }} /></div>
                <span className="bar-value">{player.currentSan}/{player.san}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
