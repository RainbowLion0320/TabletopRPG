import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';

interface SceneStageProps {
  state: GameState;
}

export function SceneStage({ state }: SceneStageProps) {
  const scene = storyData.scenes[state.currentScene];
  const activeNpcName = state.activeNpcName && scene.npcs.includes(state.activeNpcName)
    ? state.activeNpcName
    : null;
  const npc = activeNpcName ? storyData.npcs[activeNpcName] : null;

  return (
    <div className="scene-stage">
      <img className="scene-backdrop-img" src={scene.image} alt="" />
      <div className="scene-shade" />
      {npc?.portrait ? (
        <img className="scene-npc" src={npc.portrait} alt="" />
      ) : null}
    </div>
  );
}
