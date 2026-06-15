import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoDrawer } from '../../src/components/game/InfoDrawer';
import { storyData } from '../../src/data/storyData';
import { makeState } from '../dm/fixtures';

function renderDrawer(state = makeState({ activeNpcName: '伊莎贝拉·摩勒' })) {
  return render(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
}

function caseBoardCanvas(container: HTMLElement) {
  const canvas = container.querySelector('.case-board-canvas');
  expect(canvas).not.toBeNull();
  return within(canvas as HTMLElement);
}

describe('InfoDrawer case board', () => {
  it('opens on the case board without revealing undiscovered evidence or locked locations', () => {
    const { container } = renderDrawer();
    const board = caseBoardCanvas(container);

    expect(screen.getByRole('button', { name: '案件板' })).toHaveClass('active');
    expect(screen.queryByRole('button', { name: '线索' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '人物' })).not.toBeInTheDocument();
    expect(board.getByText('摩勒住宅')).toBeInTheDocument();
    expect(board.getByText('伊莎贝拉·摩勒')).toBeInTheDocument();
    expect(screen.queryByText('卡森其药店')).not.toBeInTheDocument();
    expect(screen.queryByText('扶桑花号')).not.toBeInTheDocument();
    expect(screen.queryByText('走私嫌疑')).not.toBeInTheDocument();
  });

  it('uses a fullscreen drawer layout for long-running case boards', () => {
    const { container } = renderDrawer();
    const drawer = container.querySelector('.info-drawer-react');

    expect(drawer).not.toBeNull();
    expect(drawer).toHaveClass('fullscreen');
    expect(drawer).toHaveClass('open');
  });

  it('reveals the Carson pharmacy branch after the hidden pamphlet clue is found', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];

    const { container } = renderDrawer(state);
    const board = caseBoardCanvas(container);

    expect(board.getByText('小册子')).toBeInTheDocument();
    expect(board.getByText('卡森其药店')).toBeInTheDocument();
    expect(board.getByText('指向地址')).toBeInTheDocument();
    expect(screen.queryByText('扶桑花号')).not.toBeInTheDocument();
  });

  it('reveals the Fusang route after the wet map note is found', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null });
    state.clues = [{ ...storyData.items.I07, found: true }];

    const { container } = renderDrawer(state);
    const board = caseBoardCanvas(container);

    expect(board.getByText('潮湿的地图笔记')).toBeInTheDocument();
    expect(board.getByText('扶桑花号')).toBeInTheDocument();
    expect(board.getByText('定位')).toBeInTheDocument();
  });

  it('opens the existing clue detail modal from an evidence card', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];

    const { container } = renderDrawer(state);
    fireEvent.click(caseBoardCanvas(container).getByRole('button', { name: /小册子/ }));

    expect(screen.getByText(/卡森其·贝尔14/)).toBeInTheDocument();
  });

  it('renders dynamic confirmed and hypothesis case board cards with distinct styles', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.eventLog = [{ id: 'e1', turn: 1, kind: 'narrative', description: '玩家发现药店后门有被撬痕迹' }];
    state.caseBoard = {
      nodes: [
        {
          id: 'ai-backdoor-mark',
          type: 'event',
          title: '药店后门被撬',
          subtitle: '来自本轮现场观察',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        },
        {
          id: 'ai-inside-help',
          type: 'theory',
          title: '可能有内应协助',
          subtitle: '根据后门痕迹推测',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: [
        {
          id: 'ai-edge-backdoor-help',
          from: 'ai-backdoor-mark',
          to: 'ai-inside-help',
          label: '推测',
          tone: 'suspicion',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      lastUpdatedTurn: 1
    };

    const { container } = renderDrawer(state);
    const board = caseBoardCanvas(container);

    expect(board.getByRole('button', { name: /药店后门被撬/ })).toHaveClass('dynamic', 'confirmed');
    expect(board.getByRole('button', { name: /可能有内应协助/ })).toHaveClass('dynamic', 'hypothesis');
    expect(container.querySelector('.case-board-line.hypothesis')).not.toBeNull();
  });

  it('opens a dynamic case board detail modal from an AI card', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.eventLog = [{ id: 'e1', turn: 1, kind: 'narrative', description: '伊莎贝拉回避父亲债务问题' }];
    state.caseBoard = {
      nodes: [
        {
          id: 'ai-isabella-debt',
          type: 'theory',
          title: '伊莎贝拉回避债务问题',
          subtitle: '来自本轮对话',
          detail: '她对父亲债务的反应明显谨慎，可能担心牵连家族声誉。',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: [],
      lastUpdatedTurn: 1
    };

    const { container } = renderDrawer(state);
    fireEvent.click(caseBoardCanvas(container).getByRole('button', { name: /伊莎贝拉回避债务问题/ }));

    const dialog = screen.getByRole('dialog', { name: '伊莎贝拉回避债务问题' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('推测')).toBeInTheDocument();
    expect(within(dialog).getByText(/父亲债务的反应明显谨慎/)).toBeInTheDocument();
    expect(within(dialog).getByText('来源事件：e1')).toBeInTheDocument();
  });

  it('keeps the action log as the only auxiliary tab', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];
    state.actionLog = [{ time: '20:00', text: '检查书房桌面' }];

    renderDrawer(state);

    expect(screen.getAllByRole('button', { name: /^(案件板|日志)$/ })).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: '已获线索' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '人物' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '日志' }));
    const logSection = screen.getByRole('region', { name: '行动日志' });
    expect(within(logSection).getByText('检查书房桌面')).toBeInTheDocument();
  });
});
