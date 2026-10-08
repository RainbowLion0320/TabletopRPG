import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvestigatorSheet } from '../../src/components/game/InvestigatorSheet';
import { makeInvestigator } from '../dm/fixtures';

describe('InvestigatorSheet', () => {
  it('keeps a skill search when comparing teammates and clears it after closing the sheet', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利' }, { 侦查: 75 }), makeInvestigator({ id: 'ada', name: '艾达' }, { 侦查: 50 })];
    const select = vi.fn();
    const { rerender, unmount } = render(<InvestigatorSheet players={players} selectedId="henry" onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '侦查' } });
    fireEvent.click(screen.getByRole('button', { name: '艾达', exact: true }));
    expect(select).toHaveBeenCalledWith('ada');
    rerender(<InvestigatorSheet players={players} selectedId="ada" onSelect={select} onClose={vi.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('侦查');
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['50', '25', '10']);
    unmount();
    render(<InvestigatorSheet players={players} selectedId="ada" onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
  it('shows live resources and uses the actual check thresholds, including current luck', () => {
    const player = makeInvestigator({ id: 'henry', name: '亨利', currentHp: 3, currentMp: 0, currentSan: 18 }, { 侦查: 67 });
    player.luck = 23;
    const close = vi.fn();
    const { rerender } = render(<InvestigatorSheet players={[player]} selectedId="henry" onSelect={vi.fn()} onClose={close} />);
    const vital = (key: string) => document.querySelector(`[data-stat='${key}'] dd`)!;
    expect(vital('hp')).toHaveTextContent('3 / 11');
    expect(vital('mp')).toHaveTextContent('0 / 12');
    expect(vital('san')).toHaveTextContent('18 / 60');
    expect(vital('luck')).toHaveTextContent('23');
    expect(screen.queryByRole('navigation', { name: '查看队员' })).toBeNull();
    rerender(<InvestigatorSheet players={[{ ...player, currentHp: 2 }]} selectedId="henry" onSelect={vi.fn()} onClose={close} />);
    expect(vital('hp')).toHaveTextContent('2 / 11');
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    const row = screen.getByRole('rowheader', { name: '侦查' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['67', '33', '13']);
    const luck = screen.getByRole('rowheader', { name: '幸运' }).closest('tr')!;
    expect(within(luck).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['23', '11', '4']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在' } });
    expect(screen.getByText('没有匹配的技能，试试其他名称。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除技能搜索' }));
    expect(screen.getByRole('rowheader', { name: '侦查' })).toBeInTheDocument();
  });

  it('changes the inspected teammate without mutating players and displays only recorded possessions', () => {
    const henry = makeInvestigator({ id: 'henry', name: '亨利', equipment: ['放大镜'], background: { story: '旧案档案。' } });
    const ada = makeInvestigator({ id: 'ada', name: '艾达', job: '医生' });
    const players = [henry, ada], original = structuredClone(players), select = vi.fn();
    const { rerender } = render(<InvestigatorSheet players={players} selectedId="henry" onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '随身与背景' }));
    expect(screen.getByText('放大镜')).toBeInTheDocument();
    expect(screen.getByText('旧案档案。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '艾达', exact: true }));
    expect(select).toHaveBeenCalledWith('ada');
    rerender(<InvestigatorSheet players={players} selectedId="ada" onSelect={select} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('艾达');
    expect(screen.getByText('暂无随身装备记录。')).toBeInTheDocument();
    expect(screen.getByText('暂无背景记录。')).toBeInTheDocument();
    expect(players).toEqual(original);
  });

  it('supports keyboard tabs, Escape and focus return to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener); opener.focus();
    const close = vi.fn();
    const { unmount } = render(<InvestigatorSheet players={[makeInvestigator({ id: 'henry', name: '亨利' })]} selectedId="henry" onSelect={vi.fn()} onClose={close} />);
    expect(screen.getByRole('button', { name: '关闭调查员档案' })).toHaveFocus();
    const first = screen.getByRole('tab', { name: '属性' }); first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '技能' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('技能');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    unmount(); expect(opener).toHaveFocus(); opener.remove();
  });
});
