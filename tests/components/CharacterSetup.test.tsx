import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterSetup } from '../../src/components/setup/CharacterSetup';
import type { Investigator } from '../../src/types/game';

describe('CharacterSetup', () => {
  it('defaults to solo and prevents an empty party while supporting all four investigators', () => {
    const start = vi.fn<(players: Investigator[]) => void>();
    render(<CharacterSetup portrait onBack={vi.fn()} onStart={start} />);
    const choices = screen.getAllByRole('checkbox');
    expect(choices.filter(choice => (choice as HTMLInputElement).checked)).toHaveLength(1);
    fireEvent.click(choices[0]);
    const enter = screen.getByRole('button', { name: '进入游戏' });
    expect(enter).toBeDisabled();
    choices.forEach(choice => fireEvent.click(choice));
    fireEvent.click(enter);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0][0]).toHaveLength(4);
    expect(start.mock.calls[0][0].every(player => player.currentHp > 0 && Object.keys(player.skills).length > 0)).toBe(true);
  });

  it('lets players compare strengths and read a dossier without selecting that investigator', () => {
    render(<CharacterSetup portrait onBack={vi.fn()} onStart={vi.fn()} />);
    const ada = screen.getByRole('checkbox', { name: '选择艾达·华莱士' });
    const card = ada.closest('article')!;
    expect(within(card).getByLabelText('艾达·华莱士擅长技能')).toHaveTextContent('急救80医学75');
    const panel = card.querySelector<HTMLElement>('.preset-other-panel')!;
    expect(panel).not.toBeVisible();
    fireEvent.click(within(card).getByRole('button', { name: '档案详情' }));
    expect(panel).toBeVisible();
    expect(within(panel).getByText('生命高于一切')).toBeVisible();
    expect(ada).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择亨利·格雷' })).toBeChecked();
    fireEvent.click(within(card).getByRole('button', { name: '收起档案' }));
    expect(panel).not.toBeVisible();
  });
});
