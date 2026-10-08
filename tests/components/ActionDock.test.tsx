import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from '../../src/components/game/ActionDock';
import { makeInvestigator, makeState } from '../dm/fixtures';
import { createScenarioProgress, getScenarioDefinition } from '../../src/scenario/engine';

describe('ActionDock player-specific suggestions', () => {
  it.each(['END_A', 'END_B', 'END_C'])('keeps the authored %s outcome and party inspectable without reopening actions', (endingId) => {
    const state = makeState({ players: [makeInvestigator({ id: 'henry', name: '亨利' }), makeInvestigator({ id: 'ada', name: '艾达' })] });
    state.scenarioProgress = createScenarioProgress(); state.scenarioProgress.endingId = endingId;
    state.declarations.ada = '保留的旧行动'; state.currentActorIndex = 1;
    const original = JSON.stringify(state);
    const review = vi.fn(), home = vi.fn(), inspect = vi.fn(), submit = vi.fn(), change = vi.fn(), roll = vi.fn(), retry = vi.fn();
    render(<ActionDock state={state} isDiceRolling={false} onInspectPlayer={inspect} onReview={review} onHome={home}
      onSubmit={submit} onDeclarationChange={change} onRoll={roll} onSuggestion={vi.fn()} onRetry={retry} />);
    const ending = getScenarioDefinition().progression.endings.find(item => item.id === endingId)!;
    expect(screen.getByRole('region', { name: '游戏结局' })).toHaveTextContent(ending.summary);
    expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByText('行动中')).toBeNull();
    expect(screen.queryByText('已提交')).toBeNull(); expect(screen.queryByRole('button', { name: '重试本轮' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /查看艾达的属性，HP/ }));
    fireEvent.click(screen.getByRole('button', { name: '调查回顾' }));
    expect(screen.getByRole('button', { name: '调查回顾' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(inspect).toHaveBeenCalledWith('ada'); expect(review).toHaveBeenCalledOnce(); expect(home).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled(); expect(roll).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(original);
  });
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

  it('keeps phone Enter as a newline and preserves multiline declarations until the explicit confirmation', () => {
    const state = makeState();
    state.declarations[state.players[0].id] = '沿门廊查看\n询问失踪经过';
    const onSubmit = vi.fn(), onChange = vi.fn();
    render(<ActionDock portrait autoFocusInput={false} onInspectPlayer={vi.fn()} isDiceRolling={false} state={state} onDeclarationChange={onChange} onSubmit={onSubmit} onRoll={vi.fn()} onSuggestion={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input.tagName).toBe('TEXTAREA');
    expect(input).toHaveAttribute('enterkeyhint', 'enter');
    expect(input).toHaveValue('沿门廊查看\n询问失踪经过');
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '沿门廊查看\n询问失踪经过\n观察窗框' } });
    expect(onChange).toHaveBeenCalledWith(state.players[0].id, '沿门廊查看\n询问失踪经过\n观察窗框');
    fireEvent.click(screen.getByRole('button', { name: '提交', exact: true }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('allows Shift Enter on desktop and indicates the current and completed actors only during declaration', () => {
    const state = makeState({ players: [makeInvestigator({ id: 'henry', name: '亨利' }), makeInvestigator({ id: 'ada', name: '艾达' })] });
    state.currentActorIndex = 1;
    state.declarations = { henry: '侦查门廊', ada: '观察窗框' };
    const onSubmit = vi.fn();
    const props = { isDiceRolling: false, onInspectPlayer: vi.fn(), onDeclarationChange: vi.fn(), onSubmit, onRoll: vi.fn(), onSuggestion: vi.fn() };
    const { rerender } = render(<ActionDock state={state} {...props} />);
    expect(fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /查看艾达的属性，HP/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /查看亨利的属性，HP/ })).toHaveTextContent('已提交');
    rerender(<ActionDock state={{ ...state, isThinking: true }} {...props} />);
    expect(screen.queryByText('行动中')).not.toBeInTheDocument();
    expect(screen.queryByText('已提交')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
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
