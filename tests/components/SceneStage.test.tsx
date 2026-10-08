import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneStage } from '../../src/components/game/SceneStage';
import { storyData } from '../../src/data/storyData';
import { makeState } from '../dm/fixtures';

describe('SceneStage', () => {
  it('never renders an NPC portrait outside its authored scene', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '洛夫·蒙特利尔' });
    const { container } = render(<SceneStage state={state} />);

    expect(container.querySelector('.scene-backdrop-img')?.getAttribute('src')).toBe(storyData.scenes.S01.image);
    expect(container.querySelector('.scene-npc')).toBeNull();
  });
});
