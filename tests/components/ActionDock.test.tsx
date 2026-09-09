import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from '../../src/components/game/ActionDock';
import { makeInvestigator, makeState } from '../dm/fixtures';

describe('ActionDock player-specific suggestions', () => {
  it('opens the requested investigator from the avatar or party card without submitting or changing a draft', () => {
    const state = makeState({ players: [makeInvestigator({ id: 'henry', name: '亨利' }), makeInvestigator({ id: 'ada', name: '艾达' })] });
    state.currentActorIndex = 1;
    state.declarations.ada = '检查窗边';
    const inspect = vi.fn(), submit = vi.fn(), change = vi.fn();
    render(<ActionDock onInspectPlayer={inspect} isDiceRolling={false} state={state} onDeclarationChange={change} onSubmit={submit} onRoll={vi.fn()} onSuggestion={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看艾达的属性', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /查看亨利的属性，HP/ }));
    expect(inspect.mock.calls).toEqual([['ada'], ['henry']]);
    expect(submit).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('检查窗边');
    expect(state.currentActorIndex).toBe(1);
  });
  it('does not submit when Enter confirms Chinese IME input or repeats a held key', () => {
    const state = makeState();
    state.declarations[state.players[0].id] = '询问情况';
    const onSubmit = vi.fn();
    render(<ActionDock onInspectPlayer={vi.fn()} isDiceRolling={false} state={state} onDeclarationChange={vi.fn()} onSubmit={onSubmit} onRoll={vi.fn()} onSuggestion={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('offers retry for preserved actions and prevents another round from overwriting them', () => {
    const state = makeState();
    state.pendingDmActions = [{ player: state.players[0].name, action: '询问情况' }];
    const retry = vi.fn();
    render(<ActionDock onInspectPlayer={vi.fn()} isDiceRolling={false} state={state} onDeclarationChange={vi.fn()} onSubmit={vi.fn()} onRoll={vi.fn()} onSuggestion={vi.fn()} onRetry={retry} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重试本轮' }));
    expect(retry).toHaveBeenCalledOnce();
  });
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
        onInspectPlayer={vi.fn()} isDiceRolling={false}
        state={state}
        onDeclarationChange={vi.fn()}
        onSubmit={vi.fn()}
        onRoll={vi.fn()}
        onSuggestion={vi.fn()}
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
        onInspectPlayer={vi.fn()}
        isDiceRolling
        state={state}
        onDeclarationChange={vi.fn()}
        onSubmit={vi.fn()}
        onRoll={vi.fn()}
        onSuggestion={vi.fn()}
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
        onInspectPlayer={vi.fn()} isDiceRolling={false}
        state={state}
        onDeclarationChange={vi.fn()}
        onSubmit={vi.fn()}
        onRoll={vi.fn()}
        onSuggestion={vi.fn()}
      />
    );

    expect(screen.getByText(/本轮第 1\/2 个/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('亨利 想要做什么...')).toBeDisabled();
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
        onInspectPlayer={vi.fn()} isDiceRolling={false}
        state={state}
        onDeclarationChange={vi.fn()}
        onSubmit={vi.fn()}
        onRoll={vi.fn()}
        onSuggestion={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '追问上一场景人物' })).toBeNull();
    expect(screen.getByPlaceholderText('亨利 想要做什么...')).toBeDisabled();
  });
});
