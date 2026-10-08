import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoDrawer } from '../../src/components/game/InfoDrawer';
import { storyData } from '../../src/data/storyData';
import { makeState } from '../dm/fixtures';
import { createScenarioProgress } from '../../src/scenario/engine';

const { layout } = vi.hoisted(() => ({ layout: { portrait: false } }));
vi.mock('../../src/platform/layout', () => ({ useCaseBoardListLayout: () => true, usePortraitLayout: () => layout.portrait }));
beforeEach(() => { layout.portrait = false; });

function renderDrawer(state = makeState({ activeNpcName: '伊莎贝拉·摩勒' })) {
  return render(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
}

describe('InfoDrawer v7 investigation workspace', () => {
  it('puts the current objective before a collapsible review without showing locked objectives', () => {
    const state = makeState(); state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.objectiveStates.O01 = 'completed'; state.scenarioProgress.objectiveStates.O02 = 'active';
    renderDrawer(state); fireEvent.click(screen.getByRole('tab', { name: '进度' }));
    expect(screen.getByText('在摩勒住宅寻找能指向下一处调查地点的证据。')).toBeVisible();
    const history = screen.getByText('调查回顾').closest('details')!;
    expect(history).not.toHaveAttribute('open');
    expect(screen.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).not.toBeVisible();
    expect(screen.queryByText(/说服老赫特酒保/)).toBeNull();
    fireEvent.click(screen.getByText('调查回顾'));
    expect(history).toHaveAttribute('open');
    expect(screen.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).toBeVisible();
    expect(state.scenarioProgress.objectiveStates.O01).toBe('completed');
  });
  it('shows only known clue counts and authored visible clocks, with no empty or internal clock heading', () => {
    const state = makeState(); state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clueStates.I04 = 'discovered'; state.scenarioProgress.clueStates.I05 = 'analyzed';
    state.scenarioProgress.clocks.fusangEscape = { value: 6, active: true, visible: false };
    state.scenarioProgress.clocks.internal = { value: 99, active: true, visible: true };
    const view = render(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
    fireEvent.click(screen.getByRole('tab', { name: '进度' }));
    expect(screen.getByText(/已发现/)).toHaveTextContent('已发现 2 · 已分析 1');
    expect(screen.queryByRole('heading', { name: '局势' })).toBeNull();
    const revealed = { ...state, scenarioProgress: { ...state.scenarioProgress, clocks: {
      ...state.scenarioProgress.clocks, fusangEscape: { value: 6, active: true, visible: true }
    } } };
    view.rerender(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={revealed} />);
    const meter = screen.getByRole('progressbar', { name: '扶桑花号离港' });
    expect(meter).toHaveAttribute('value', '6'); expect(meter).toHaveAttribute('max', '7');
    expect(screen.queryByText('internal')).toBeNull();
  });
  it('searches visible log text and time while preserving order, full multiline text and the saved records', () => {
    const state = makeState(); state.actionLog = [
      { time: '21:02', text: 'Henry · 侦查：普通成功\n门槛上有划痕。' },
      { time: '21:01', text: '剧情事件：EV_HIDDEN_TRACE' },
      { time: '21:00', text: '检查窗框' }
    ];
    const original = JSON.stringify(state.actionLog);
    renderDrawer(state); fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    const list = screen.getByRole('list', { name: '行动记录' });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Henry · 侦查');
    const input = screen.getByRole('searchbox', { name: '搜索行动日志' });
    fireEvent.change(input, { target: { value: ' HENRY ' } });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText(/门槛上有划痕/).textContent).toContain('\n');
    fireEvent.change(input, { target: { value: '21:00' } }); expect(screen.getByText('检查窗框')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'EV_HIDDEN_TRACE' } });
    expect(screen.getByRole('status')).toHaveTextContent('没有找到相关记录。');
    expect(screen.queryByText('剧情事件：EV_HIDDEN_TRACE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清空日志搜索' })); expect(input).toHaveFocus();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(JSON.stringify(state.actionLog)).toBe(original);
  });
  it('keeps a log search and reading position when switching tabs but starts fresh after closing', () => {
    const state = makeState(); state.actionLog = [{ time: '21:00', text: '检查窗框' }];
    const view = render(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
    fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索行动日志' }), { target: { value: '窗框' } });
    const list = screen.getByRole('list', { name: '行动记录' }); list.scrollTop = 72; fireEvent.scroll(list);
    fireEvent.click(screen.getByRole('tab', { name: '进度' })); fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    expect(screen.getByRole('searchbox', { name: '搜索行动日志' })).toHaveValue('窗框');
    expect(screen.getByRole('list', { name: '行动记录' }).scrollTop).toBe(72);
    view.rerender(<InfoDrawer open={false} onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
    expect(screen.queryByRole('searchbox', { name: '搜索行动日志' })).toBeNull();
    view.rerender(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
    fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    expect(screen.getByRole('searchbox', { name: '搜索行动日志' })).toHaveValue('');
    expect(screen.getByRole('list', { name: '行动记录' }).scrollTop).toBe(0);
  });
  it('keeps the fixed phone entry a normal button despite small pointer movement', () => {
    layout.portrait = true;
    const onOpen = vi.fn();
    render(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={makeState()} />);
    const entry = screen.getByRole('button', { name: '资料', exact: true });
    const capture = vi.fn(); entry.setPointerCapture = capture;
    fireEvent.pointerDown(entry, { pointerId: 1, isPrimary: true, button: 0, clientY: 28 });
    fireEvent.pointerMove(entry, { pointerId: 1, isPrimary: true, clientY: 34 });
    fireEvent.pointerUp(entry, { pointerId: 1, isPrimary: true, clientY: 34 });
    fireEvent.click(entry, { detail: 1 });
    expect(onOpen).toHaveBeenCalledOnce(); expect(entry).toHaveFocus();
    expect(capture).not.toHaveBeenCalled(); expect(entry).not.toHaveClass('dragging', 'draggable');
    expect(entry.style.top).toBe(''); expect(entry).toHaveAttribute('title', '资料');
  });
  it('moves the desktop entry without opening it, clears the drag state and still allows keyboard opening', () => {
    const onOpen = vi.fn();
    render(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={makeState()} />);
    const entry = screen.getByRole('button', { name: '资料', exact: true });
    entry.setPointerCapture = vi.fn(); entry.hasPointerCapture = vi.fn(() => true); entry.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(entry, { pointerId: 3, isPrimary: true, button: 0, clientY: 100 });
    fireEvent.pointerMove(entry, { pointerId: 3, isPrimary: true, clientY: 160 });
    expect(entry).toHaveClass('dragging'); expect(parseFloat(entry.style.top)).toBeGreaterThan(43);
    fireEvent.pointerUp(entry, { pointerId: 3, isPrimary: true, clientY: 160 });
    fireEvent.lostPointerCapture(entry, { pointerId: 3 });
    fireEvent.click(entry, { detail: 1 });
    expect(onOpen).not.toHaveBeenCalled(); expect(entry).not.toHaveClass('dragging');
    expect(entry.releasePointerCapture).toHaveBeenCalledWith(3);
    fireEvent.click(entry, { detail: 0 }); expect(onOpen).toHaveBeenCalledOnce();
  });
  it('recovers from cancelled desktop drags so the next ordinary click opens once', () => {
    const onOpen = vi.fn();
    render(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={makeState()} />);
    const entry = screen.getByRole('button', { name: '资料', exact: true });
    entry.setPointerCapture = vi.fn(); entry.hasPointerCapture = vi.fn(() => true); entry.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(entry, { pointerId: 2, isPrimary: true, button: 0, clientY: 100 });
    fireEvent.pointerMove(entry, { pointerId: 2, isPrimary: true, clientY: 180 });
    fireEvent.pointerCancel(entry, { pointerId: 2 }); expect(entry).not.toHaveClass('dragging');
    fireEvent.pointerDown(entry, { pointerId: 4, isPrimary: true, button: 0, clientY: 180 });
    fireEvent.pointerUp(entry, { pointerId: 4, isPrimary: true, clientY: 180 });
    fireEvent.click(entry, { detail: 1 }); expect(onOpen).toHaveBeenCalledOnce();
  });
  it('cancels an active desktop drag when switching to the fixed phone layout', () => {
    const onOpen = vi.fn(); const state = makeState();
    const view = render(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={state} />);
    const entry = screen.getByRole('button', { name: '资料', exact: true });
    entry.setPointerCapture = vi.fn(); entry.hasPointerCapture = vi.fn(() => true); entry.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(entry, { pointerId: 5, isPrimary: true, button: 0, clientY: 100 });
    fireEvent.pointerMove(entry, { pointerId: 5, isPrimary: true, clientY: 180 });
    layout.portrait = true;
    view.rerender(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={state} />);
    expect(entry.releasePointerCapture).toHaveBeenCalledWith(5);
    expect(entry).not.toHaveClass('dragging', 'draggable'); expect(entry.style.top).toBe('');
    fireEvent.click(entry, { detail: 1 }); expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(entry, { detail: 0 }); expect(onOpen).toHaveBeenCalledOnce();
  });
  it('follows only known related records, returns within the detail and preserves the list filter and opener', async () => {
    renderDrawer();
    const type = await screen.findByRole('combobox', { name: '资料类型' });
    fireEvent.change(type, { target: { value: 'npc' } });
    const opener = await screen.findByRole('button', { name: '人物 伊莎贝拉·摩勒' }); fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: '查看摩勒住宅资料' }));
    expect(screen.getByRole('dialog', { name: '摩勒住宅详情' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看卡森其药店资料' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回上一份资料' }));
    expect(screen.getByRole('dialog', { name: '伊莎贝拉·摩勒详情' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '资料', exact: true })).toBeInTheDocument();
    expect(type).toHaveValue('npc'); expect(opener).toHaveFocus();
  });
  it('uses keyboard tabs and keeps script-wide clue totals out of player progress', async () => {
    renderDrawer();
    const board = screen.getByRole('tab', { name: '案件板' });
    expect(board).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: '资料' })).toBeInTheDocument();
    board.focus(); fireEvent.keyDown(board, { key: 'ArrowLeft' });
    const progress = screen.getByRole('tab', { name: '进度' });
    expect(progress).toHaveFocus(); expect(progress).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('进度');
    expect(screen.queryByText(/已发现 0/)).toBeNull();
    expect(screen.queryByRole('heading', { name: '线索进度' })).toBeNull();
    expect(screen.queryByText(/\/\s*8/)).toBeNull();
    fireEvent.keyDown(progress, { key: 'End' });
    expect(screen.getByRole('tab', { name: '日志' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('日志');
  });
  it('hides internal event IDs from the player log while retaining ordinary records', () => {
    const state = makeState();
    state.actionLog = [
      { time: '17:35', text: '剧情事件：EV_ACCEPT_COMMISSION' },
      { time: '17:35', text: '伊莎贝拉开始讲述父亲失踪的经过。' }
    ];
    renderDrawer(state);
    fireEvent.click(screen.getByRole('tab', { name: '日志', exact: true }));
    expect(screen.queryByText(/EV_ACCEPT_COMMISSION/)).not.toBeInTheDocument();
    expect(screen.getByText('伊莎贝拉开始讲述父亲失踪的经过。')).toBeInTheDocument();
    expect(state.actionLog[0].text).toContain('EV_ACCEPT_COMMISSION');
  });

  it('supports keyboard/accessibility activation without loading the closed board', () => {
    const onOpen = vi.fn();
    const { container } = render(<InfoDrawer open={false} onClose={vi.fn()} onOpen={onOpen} state={makeState()} />);
    expect(container.querySelector('.case-board-view')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '资料' }), { detail: 0 });
    expect(onOpen).toHaveBeenCalledOnce();
  });
  it('opens on a spoiler-safe case board with only visible entities', async () => {
    renderDrawer();
    expect(await screen.findByRole('heading', { name: '案件板' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '案件板' })).toHaveClass('active');
    expect(screen.getAllByText('摩勒住宅').length).toBeGreaterThan(0);
    expect(screen.getAllByText('伊莎贝拉·摩勒').length).toBeGreaterThan(0);
    expect(screen.queryByText('卡森其药店')).not.toBeInTheDocument();
    expect(screen.queryByText(/鸦片运输|泰晤士港货船|蒙特利尔关系网/)).not.toBeInTheDocument();
    expect(screen.getByText(/调查刚刚开始/)).toBeInTheDocument();
  });

  it('keeps the fullscreen shell and compact header tabs', async () => {
    const { container } = renderDrawer();
    await screen.findByRole('heading', { name: '案件板' }, { timeout: 5_000 });
    expect(container.querySelector('.info-drawer-react')).toHaveClass('fullscreen', 'open');
    const header = container.querySelector('.info-drawer-react > header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole('tab', { name: '案件板' })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole('tab', { name: '日志' })).toBeInTheDocument();
  });

  it('returns focus to the drawer tab before closing', async () => {
    const onClose = vi.fn();
    render(<InfoDrawer open onClose={onClose} onOpen={vi.fn()} state={makeState()} />);
    const drawerTab = screen.getByRole('button', { name: '资料' });

    fireEvent.click(screen.getByRole('button', { name: '关闭资料' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(drawerTab);
  });

  it('reveals authored branches and supports type filtering', async () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clueStates.I04 = 'discovered';
    renderDrawer(state);
    expect((await screen.findAllByText('小册子')).length).toBeGreaterThan(0);
    expect(screen.queryByText('卡森其药店')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '资料类型' }), { target: { value: 'item' } });
    const mobileList = screen.getByLabelText('案件资料列表');
    await waitFor(() => expect(within(mobileList).queryByText('伊莎贝拉·摩勒')).not.toBeInTheDocument());
    expect(within(mobileList).getAllByText('小册子').length).toBeGreaterThan(0);
  });

  it('shows connected dynamic nodes and readable inspector sources', async () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.eventLog = [{ id: 'e1', turn: 3, kind: 'narrative', description: '玩家发现药店后门有被撬痕迹' }];
    state.caseBoard = {
      nodes: [{
        id: 'ai-backdoor', semanticKey: 'event:backdoor', type: 'event', title: '药店后门被撬', subtitle: '现场观察',
        detail: '门锁附近存在新鲜撬痕。', importance: 4, source: 'ai', certainty: 'confirmed', sourceFactIds: [],
        sourceEventIds: ['e1'], sourceClueIds: [], createdTurn: 3, updatedTurn: 3, status: 'active'
      }],
      edges: [{
        id: 'edge-backdoor', relationKey: 'scene-backdoor', from: 'scene-s01', to: 'ai-backdoor', label: '发现于此',
        tone: 'evidence', source: 'ai', certainty: 'confirmed', sourceFactIds: [], sourceEventIds: ['e1'], sourceClueIds: [],
        createdTurn: 3, updatedTurn: 3, status: 'active'
      }],
      insights: [],
      lastUpdatedTurn: 3
    };
    renderDrawer(state);
    const card = await screen.findByLabelText('事件 药店后门被撬');
    fireEvent.click(card);
    const inspector = await screen.findByLabelText('药店后门被撬详情');
    expect(within(inspector).getByText('第 3 回合：玩家发现药店后门有被撬痕迹')).toBeInTheDocument();
    expect(within(inspector).queryByText(/e1/)).not.toBeInTheDocument();
  });

  it('keeps the action log as the only auxiliary tab', async () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.actionLog = [{ time: '20:00', text: '检查书房桌面' }];
    renderDrawer(state);
    await screen.findByRole('heading', { name: '案件板' });
    fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    expect(screen.getByRole('heading', { name: '行动日志' })).toBeInTheDocument();
    expect(screen.getByText('检查书房桌面')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '线索' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '人物' })).not.toBeInTheDocument();
  });

  it('shows authored clock labels and limits instead of internal ids', async () => {
    const state = makeState({ activeNpcName: '扶桑花号交涉代表', currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clocks.fusangEscape = { value: 6, active: true, visible: true };
    renderDrawer(state);
    fireEvent.click(screen.getByRole('tab', { name: '进度' }));

    expect(screen.getByText('扶桑花号离港')).toBeInTheDocument();
    expect(screen.getByText('6 / 7')).toBeInTheDocument();
    expect(screen.queryByText('fusangEscape')).not.toBeInTheDocument();
  });

  it('stays usable while a restored progress record is being normalized', async () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.scenarioProgress = {
      ...createScenarioProgress(),
      objectiveStates: undefined,
      clueStates: undefined,
      clocks: undefined
    } as unknown as typeof state.scenarioProgress;
    state.actionLog = undefined as unknown as typeof state.actionLog;
    renderDrawer(state);

    fireEvent.click(screen.getByRole('tab', { name: '进度' }));
    expect(screen.getByRole('heading', { name: '调查目标' })).toBeInTheDocument();
    expect(screen.queryByText(/已发现 0/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '日志' }));
    expect(screen.getByRole('heading', { name: '行动日志' })).toBeInTheDocument();
    expect(screen.getByText('暂无行动记录。')).toBeInTheDocument();
  });
});
