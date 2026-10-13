import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDock } from '../../src/components/game/ActionDock';
import { GameMenu } from '../../src/components/game/GameMenu';
import { useGameController } from '../../src/app/useGameController';
import { runDmTurn } from '../../src/dm/pipeline';
import { makeInvestigator, makeState } from '../dm/fixtures';
import { createScenarioProgress, getScenarioDefinition } from '../../src/scenario/engine';

vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));

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
    fireEvent.click(screen.getByRole('button', { name: /查看艾达的属性，生命/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /查看亨利的属性，生命/ }));
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
    expect(screen.getByRole('button', { name: /查看艾达的属性，生命/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /查看亨利的属性，生命/ })).toHaveTextContent('已提交');
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
  it('keeps the full suggestion action while its preview and context change', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const long = '沿着门廊与窗边逐处查看细小划痕，再询问委托人失踪前几天来往的访客，记下姓名和时间。';
    const state = makeState({ players: [henry, ada] });
    state.suggestionsByPlayerId = { 'p-henry': [long], 'p-ada': ['询问访客'] };
    const onSuggestion = vi.fn();
    const props = { onInspectPlayer: vi.fn(), isDiceRolling: false, onDeclarationChange: vi.fn(), onSubmit: vi.fn(), onRoll: vi.fn(), onSuggestion };
    const { container, rerender } = render(<ActionDock {...props} state={state} />);
    const row = container.querySelector('.suggestion-row');
    const input = container.querySelector('.dock-input');
    fireEvent.click(screen.getByRole('button', { name: long }));
    expect(onSuggestion).toHaveBeenCalledWith(long);
    expect(container.querySelector('.action-suggestion-text')).toHaveTextContent(long);
    rerender(<ActionDock {...props} state={{ ...state, declarations: { 'p-henry': '编辑自己的行动。' } }} />);
    expect(container.querySelector('.suggestion-row')).toBe(row);
    expect(container.querySelector('.dock-input')).toBe(input);
    rerender(<ActionDock {...props} state={{ ...state, currentActorIndex: 1 }} />);
    expect(container.querySelector('.suggestion-row')).not.toBe(row);
    expect(container.querySelector('.dock-input')).toBe(input);
    const secondRow = container.querySelector('.suggestion-row');
    rerender(<ActionDock {...props} state={{ ...state, currentActorIndex: 1, suggestionsByPlayerId: { 'p-ada': ['检查足迹'] } }} />);
    expect(container.querySelector('.suggestion-row')).not.toBe(secondRow);
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

describe('ActionDock retry focus across real controller outcomes', () => {
  const dm = vi.mocked(runDmTurn);
  const response = { raw: '{"narrative":"调查继续。"}', legacyResponse: { narrative: '调查继续。' } };
  const players = [
    makeInvestigator({ id: 'henry', name: '亨利' }),
    makeInvestigator({ id: 'ada', name: '艾达' }),
    makeInvestigator({ id: 'thomas', name: '托马斯' }),
    makeInvestigator({ id: 'robert', name: '罗伯特' })
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_AI_API_KEY', '');
    localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
    dm.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function deferredTurn() {
    let resolve!: (value: Awaited<ReturnType<typeof runDmTurn>>) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Awaited<ReturnType<typeof runDmTurn>>>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  }

  async function failedRound(partySize: number, portrait = false) {
    let controller!: ReturnType<typeof useGameController>;
    function Harness() {
      controller = useGameController();
      return <>
        <button onClick={() => controller.setMenuOpen(true)}>打开菜单</button>
        <input aria-label="另一个字段" />
        <ActionDock portrait={portrait} autoFocusInput={!portrait} isDiceRolling={Boolean(controller.diceRoll)} state={controller.state}
          onInspectPlayer={vi.fn()} onDeclarationChange={controller.setDeclaration} onSubmit={controller.submitAction}
          onRoll={controller.handleRoll} onSuggestion={controller.applySuggestion} onRetry={controller.retryPendingTurn} />
        <GameMenu open={controller.menuOpen} onClose={() => controller.setMenuOpen(false)} onHome={controller.returnHome}
          onLoad={controller.openSaveManager} onOpenApi={controller.openApiSettings} onRestart={controller.restartSetup} onSave={controller.saveCurrentGame} />
      </>;
    }
    render(<Harness />);
    act(() => controller.startGame(players.slice(0, partySize)));
    for (let index = 0; index < partySize; index++) {
      fireEvent.change(screen.getByRole('textbox', { name: `${players[index].name}的行动` }), { target: { value: `查看门廊\n记录${players[index].name}的发现` } });
      fireEvent.click(screen.getByRole('button', { name: index === partySize - 1 ? '提交' : '下一位', exact: true }));
    }
    await screen.findByRole('button', { name: '重试本轮', exact: true });
    expect(dm).toHaveBeenCalledOnce();
    expect(controller.state.pendingDmActions).toHaveLength(partySize);
    return { getController: () => controller, actionInput: () => screen.getByRole('textbox', { name: /的行动$/ }) };
  }

  it.each([{ partySize: 2, portrait: false }, { partySize: 1, portrait: true }])('restores only the owned retry button after another failure and resumes the existing input policy (%j)', async ({ partySize, portrait }) => {
    const failedRetry = deferredTurn(), successfulRetry = deferredTurn();
    dm.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => failedRetry.promise).mockImplementationOnce(() => successfulRetry.promise);
    const game = await failedRound(partySize, portrait);
    const actionInput = game.actionInput();
    const focusInput = vi.spyOn(actionInput, 'focus');
    const firstRetry = screen.getByRole('button', { name: '重试本轮', exact: true });
    firstRetry.focus(); fireEvent.click(firstRetry);
    expect(firstRetry).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
    expect(actionInput).toBeDisabled();
    expect(game.getController().state.isThinking).toBe(true);
    expect(dm.mock.calls[1][1].actions).toEqual(dm.mock.calls[0][1].actions);

    await act(async () => failedRetry.reject(new Error('still offline')));
    const secondRetry = screen.getByRole('button', { name: '重试本轮', exact: true });
    expect(secondRetry).not.toBe(firstRetry);
    expect(secondRetry).toHaveFocus();
    expect(focusInput).not.toHaveBeenCalled();
    expect(game.getController().state.pendingDmActions).toHaveLength(partySize);
    fireEvent.click(secondRetry);
    expect(secondRetry).not.toBeInTheDocument();
    await act(async () => successfulRetry.resolve(response));
    await waitFor(() => expect(game.getController().state.pendingDmActions).toBeUndefined());
    expect(screen.queryByRole('button', { name: '重试本轮', exact: true })).toBeNull();
    expect(actionInput).toBeEnabled();
    if (portrait) { expect(focusInput).not.toHaveBeenCalled(); expect(document.body).toHaveFocus(); }
    else expect(actionInput).toHaveFocus();
    expect(dm).toHaveBeenCalledTimes(3);
    expect(dm.mock.calls[2][1].actions).toEqual(dm.mock.calls[0][1].actions);
    expect(game.getController().state.messages.filter(message => message.type === 'player')).toHaveLength(partySize);
    expect(game.getController().state.conversationHistory.map(turn => turn.role)).toEqual(['user', 'assistant']);

    // A subsequent round must not inherit the successful retry's focus intent.
    const laterRound = deferredTurn();
    dm.mockImplementationOnce(() => laterRound.promise);
    actionInput.blur();
    for (let index = 0; index < partySize; index++) {
      fireEvent.change(game.actionInput(), { target: { value: `继续查看${players[index].name}的调查目标` } });
      fireEvent.click(screen.getByRole('button', { name: index === partySize - 1 ? '提交' : '下一位', exact: true }));
    }
    const otherField = screen.getByRole('textbox', { name: '另一个字段' });
    otherField.focus(); otherField.blur();
    expect(document.body).toHaveFocus();
    await act(async () => laterRound.reject(new Error('a later round is offline')));
    expect(screen.getByRole('button', { name: '重试本轮', exact: true })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
    expect(dm).toHaveBeenCalledTimes(4);
  });

  it('consumes retry focus when the response requires a check before loading another retained round', async () => {
    const retry = deferredTurn();
    dm.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => retry.promise);
    const game = await failedRound(1);
    const failedTurn = game.getController().state;
    const retryButton = screen.getByRole('button', { name: '重试本轮', exact: true });
    retryButton.focus(); fireEvent.click(retryButton);
    await act(async () => retry.resolve({
      raw: '{"narrative":"查看门廊。","check":{"player":"亨利","skill":"侦查","difficulty":"普通"}}',
      legacyResponse: { narrative: '查看门廊。', check: { player: '亨利', skill: '侦查', difficulty: '普通' } }
    }));
    expect(game.getController().state.pendingCheck?.skill).toBe('侦查');
    expect(screen.getByRole('button', { name: '掷骰', exact: true })).toBeInTheDocument();
    expect(document.body).toHaveFocus();
    act(() => game.getController().loadSaveSlot(failedTurn));
    expect(screen.getByRole('button', { name: '重试本轮', exact: true })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
    expect(game.getController().state.pendingDmActions).toHaveLength(1);
    expect(dm).toHaveBeenCalledTimes(2);
  });

  it.each(['menu', 'menu with empty focus', 'another field', 'unfocused activation'] as const)('does not steal focus after deferred failure when %s owns the interaction', async (owner) => {
    const retry = deferredTurn();
    dm.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => retry.promise);
    const game = await failedRound(4);
    const firstRetry = screen.getByRole('button', { name: '重试本轮', exact: true });
    if (owner !== 'unfocused activation') firstRetry.focus();
    fireEvent.click(firstRetry);
    expect(firstRetry).not.toBeInTheDocument();
    if (owner.startsWith('menu')) {
      const menu = screen.getByRole('button', { name: '打开菜单', exact: true });
      menu.focus(); fireEvent.click(menu);
      expect(screen.getByRole('dialog', { name: '调查菜单' })).toBeInTheDocument();
      const close = screen.getByRole('button', { name: '关闭调查菜单', exact: true });
      expect(close).toHaveFocus();
      if (owner === 'menu with empty focus') close.blur();
    } else if (owner === 'another field') screen.getByRole('textbox', { name: '另一个字段' }).focus();
    const focusOwner = document.activeElement;
    await act(async () => retry.reject(new Error('still offline')));
    expect(screen.getByRole('button', { name: '重试本轮', exact: true })).not.toHaveFocus();
    expect(document.activeElement).toBe(focusOwner);
    expect(game.getController().state.pendingDmActions).toHaveLength(4);
    expect(game.actionInput()).toBeDisabled();
    expect(dm).toHaveBeenCalledTimes(2);
    if (owner.startsWith('menu')) {
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: '调查菜单' })).toBeNull();
      expect(screen.getByRole('button', { name: '打开菜单', exact: true })).toHaveFocus();
      expect(screen.getByRole('button', { name: '重试本轮', exact: true })).not.toHaveFocus();
    }
  });
});
