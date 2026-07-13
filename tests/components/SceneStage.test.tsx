import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneStage } from '../../src/components/game/SceneStage';
import { makeState } from '../dm/fixtures';

describe('SceneStage', () => {
  it('never renders an NPC portrait outside its authored scene', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '洛夫·蒙特利尔' });
    const { container } = render(<SceneStage state={state} />);

    expect(container.querySelector('.scene-backdrop-img')?.getAttribute('src')).toContain('%E5%AE%A2%E5%8E%85');
    expect(container.querySelector('.scene-npc')).toBeNull();
  });
});
