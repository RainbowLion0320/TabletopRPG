import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from '../../src/components/game/ActionDock';
import { makeInvestigator, makeState } from '../dm/fixtures';

describe('ActionDock player-specific suggestions', () => {
  it('shows suggestions for the current actor only', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({ players: [henry, ada] });
    state.currentActorIndex = 1;
    state.suggestions = ['全局兜底'];
    state.suggestionsByPlayerId = {
      'p-henry': ['检查书桌暗格'],
      'p-ada': ['观察窗外动静', '安抚伊莎贝拉']
    };

    render(
      <ActionDock
        state={state}
        onActorChange={vi.fn()}
        onDeclarationChange={vi.fn()}
        onSubmit={vi.fn()}
        onRoll={vi.fn()}
        onSuggestion={vi.fn()}
        onSplitPlayerChange={vi.fn()}
        onSplitSceneChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '观察窗外动静' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '安抚伊莎贝拉' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '检查书桌暗格' })).toBeNull();
    expect(screen.queryByRole('button', { name: '全局兜底' })).toBeNull();
  });
});
