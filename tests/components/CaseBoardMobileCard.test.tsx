import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CaseBoardMobileCard } from '../../src/components/game/CaseBoardMobileCard';
import type { CaseBoardDisplayNode } from '../../src/components/game/caseBoardGraph';

it('keeps a failed photo hidden until an updated picture is available', () => {
  const node: CaseBoardDisplayNode = {
    id: 'npc-record', type: 'npc', refId: 'npc-record', title: '调查中的人物',
    subtitle: '已见面', certainty: 'confirmed', importance: 1, portrait: '/portrait-old.webp',
    insightCount: 0, latestUpdateTurn: 0
  };
  const props = { relations: [], selected: false, onSelect: vi.fn() };
  const { rerender } = render(<CaseBoardMobileCard {...props} node={node} />);
  const card = screen.getByRole('button', { name: '人物 调查中的人物' });
  const photo = card.querySelector('img:not(.case-record-emblem-art)')!;
  fireEvent.error(photo);
  expect(photo.hidden).toBe(true);
  rerender(<CaseBoardMobileCard {...props} node={{ ...node, subtitle: '新增的调查记录' }} />);
  expect(card.querySelector('img:not(.case-record-emblem-art)')!.hidden).toBe(true);
  rerender(<CaseBoardMobileCard {...props} node={{ ...node, portrait: '/portrait-restored.webp' }} />);
  expect(card.querySelector('img:not(.case-record-emblem-art)')!.hidden).toBe(false);
  expect(card.querySelector('img:not(.case-record-emblem-art)')).toHaveAttribute('src', '/portrait-restored.webp');
  fireEvent.click(card);
  expect(props.onSelect).toHaveBeenCalledOnce();
  expect(card).toHaveFocus();
});
