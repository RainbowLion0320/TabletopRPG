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
        isDiceRolling={false}
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

  it('disables the roll control while the D100 presentation is active', () => {
    const state = makeState({ players: [makeInvestigator({ id: 'p-henry', name: '亨利' })] });
    state.pendingCheck = {
      player: '亨利', skill: '侦查', difficulty: '普通', threshold: 60, skillVal: 60
    };

    render(
      <ActionDock
        isDiceRolling
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

    expect(screen.getByRole('button', { name: '掷骰中' })).toBeDisabled();
  });

  it('shows multi-check progress and locks new declarations until the queue settles', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({ players: [henry, ada] });
    state.declarations = { 'p-henry': '继续搜查', 'p-ada': '观察表情' };
    state.pendingCheck = {
      player: '亨利',
      skill: '侦查',
      difficulty: '普通',
      threshold: 70,
      skillVal: 70,
      batchIndex: 1,
      batchTotal: 2,
      queuedChecks: [{
        player: '艾达',
        skill: '心理学',
        difficulty: '普通',
        threshold: 65,
        skillVal: 65,
        batchIndex: 2,
        batchTotal: 2
      }]
    };

    render(
      <ActionDock
        isDiceRolling={false}
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

    expect(screen.getByText(/本轮第 1\/2 个/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('亨利 想要做什么...')).toBeDisabled();
    expect(screen.getByRole('button', { name: /亨利 HP/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一位' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '掷骰' })).toBeEnabled();
  });

  it('hides stale suggestions and freezes the action controls while the DM is thinking', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const state = makeState({ players: [henry] });
    state.isThinking = true;
    state.suggestions = ['追问上一场景人物'];
    state.suggestionsByPlayerId = { 'p-henry': ['追问上一场景人物'] };

    render(
      <ActionDock
        isDiceRolling={false}
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

    expect(screen.queryByRole('button', { name: '追问上一场景人物' })).toBeNull();
    expect(screen.getByPlaceholderText('亨利 想要做什么...')).toBeDisabled();
    expect(screen.getByRole('button', { name: /亨利 HP/ })).toBeDisabled();
  });
});
