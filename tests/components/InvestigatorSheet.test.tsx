import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvestigatorSheet } from '../../src/components/game/InvestigatorSheet';
import { makeInvestigator } from '../dm/fixtures';

describe('InvestigatorSheet', () => {
  it('shows the complete skill list in descending value without search controls', () => {
    const player = makeInvestigator({ name: '亨利' }, { 侦查: 75, 闪避: 55, 说服: 40 });
    render(<InvestigatorSheet players={[player]} selectedId={player.id} onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    const names = screen.getAllByRole('rowheader').map(row => row.textContent);
    expect(names).toHaveLength(Object.keys(player.skills).length);
    expect(names.indexOf('侦查')).toBeLessThan(names.indexOf('闪避'));
    expect(names.indexOf('闪避')).toBeLessThan(names.indexOf('说服'));
    const row = screen.getByRole('rowheader', { name: '闪避' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['55', '27', '11']);
  });

  it('keeps each page reading position independently for each investigator', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利', background: { story: '完整的旧案记录。' } }), makeInvestigator({ id: 'ada', name: '艾达' })];
    const props = { players, onSelect: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<InvestigatorSheet {...props} selectedId="henry" />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    const body = screen.getByRole('tabpanel'); body.scrollTop = 210; fireEvent.scroll(body);
    fireEvent.click(screen.getByRole('tab', { name: '随身与背景' })); expect(body.scrollTop).toBe(0);
    body.scrollTop = 80; fireEvent.scroll(body);
    fireEvent.click(screen.getByRole('tab', { name: '技能' })); expect(body.scrollTop).toBe(210);
    fireEvent.click(screen.getByRole('tab', { name: '随身与背景' })); expect(body.scrollTop).toBe(80);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    rerender(<InvestigatorSheet {...props} selectedId="ada" />);
    expect(body.scrollTop).toBe(0); expect(screen.queryByRole('searchbox')).toBeNull();
    body.scrollTop = 40; fireEvent.scroll(body);
    rerender(<InvestigatorSheet {...props} selectedId="henry" />); expect(body.scrollTop).toBe(210);
    rerender(<InvestigatorSheet {...props} selectedId="ada" />); expect(body.scrollTop).toBe(40);
  });

  it('compares live teammate thresholds directly and starts at the top after closing the sheet', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利' }, { 侦查: 75 }), makeInvestigator({ id: 'ada', name: '艾达' }, { 侦查: 50 })];
    const select = vi.fn();
    const { rerender, unmount } = render(<InvestigatorSheet players={players} selectedId="henry" onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    fireEvent.click(screen.getByRole('button', { name: '艾达', exact: true }));
    expect(select).toHaveBeenCalledWith('ada');
    rerender(<InvestigatorSheet players={players} selectedId="ada" onSelect={select} onClose={vi.fn()} />);
    const row = screen.getByRole('rowheader', { name: '侦查' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['50', '25', '10']);
    const body = screen.getByRole('tabpanel'); body.scrollTop = 40; fireEvent.scroll(body);
    unmount();
    render(<InvestigatorSheet players={players} selectedId="ada" onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '技能' }));
    expect(screen.getByRole('tabpanel').scrollTop).toBe(0);
    expect(screen.queryByRole('searchbox')).toBeNull();
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
    expect(screen.queryByRole('searchbox')).toBeNull();
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
