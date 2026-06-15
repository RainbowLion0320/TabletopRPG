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
    expect(board.getByText('摩勒住宅')).toBeInTheDocument();
    expect(board.getByText('伊莎贝拉·摩勒')).toBeInTheDocument();
    expect(screen.queryByText('卡森其药店')).not.toBeInTheDocument();
    expect(screen.queryByText('扶桑花号')).not.toBeInTheDocument();
    expect(screen.queryByText('走私嫌疑')).not.toBeInTheDocument();
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

  it('keeps the old clue, people, and log views as tabs', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];
    state.actionLog = [{ time: '20:00', text: '检查书房桌面' }];

    renderDrawer(state);

    fireEvent.click(screen.getByRole('button', { name: '线索' }));
    expect(screen.getByRole('heading', { name: '已获线索' })).toBeInTheDocument();
    expect(screen.getByText('小册子')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '人物' }));
    expect(screen.getByRole('heading', { name: '人物' })).toBeInTheDocument();
    expect(screen.getByText('伊莎贝拉·摩勒')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '日志' }));
    const logSection = screen.getByRole('region', { name: '行动日志' });
    expect(within(logSection).getByText('检查书房桌面')).toBeInTheDocument();
  });
});
