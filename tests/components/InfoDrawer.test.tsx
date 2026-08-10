import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoDrawer } from '../../src/components/game/InfoDrawer';
import { storyData } from '../../src/data/storyData';
import { makeState } from '../dm/fixtures';

function renderDrawer(state = makeState({ activeNpcName: '伊莎贝拉·摩勒' })) {
  return render(<InfoDrawer open onClose={vi.fn()} onOpen={vi.fn()} state={state} />);
}

describe('InfoDrawer v7 investigation workspace', () => {
  it('opens on a spoiler-safe case board with only visible entities', async () => {
    renderDrawer();
    expect(await screen.findByRole('heading', { name: '案件板' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '案件板' })).toHaveClass('active');
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
    expect(within(header as HTMLElement).getByRole('button', { name: '案件板' })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole('button', { name: '日志' })).toBeInTheDocument();
  });

  it('reveals authored branches and supports type filtering', async () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];
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
    fireEvent.click(screen.getByRole('button', { name: '日志' }));
    expect(screen.getByRole('heading', { name: '行动日志' })).toBeInTheDocument();
    expect(screen.getByText('检查书房桌面')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '线索' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '人物' })).not.toBeInTheDocument();
  });
});
