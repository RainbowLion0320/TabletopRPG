import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NarrativePanel } from '../../src/components/game/NarrativePanel';
import { makeState } from '../dm/fixtures';

describe('NarrativePanel', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('renders player name and action in the same message line', () => {
    const state = makeState();
    state.messages = [
      { id: 'm-player', type: 'player', playerName: '亨利·格雷', text: '检查书房桌面。' },
      { id: 'm-dm', type: 'dm', text: '房间里传来细微声响。' }
    ];

    const { container } = render(<NarrativePanel state={state} />);

    const playerMessage = container.querySelector('.story-message.player');
    expect(playerMessage).not.toBeNull();
    const directLabel = Array.from(playerMessage?.children ?? []).find((child) =>
      child.classList.contains('message-label')
    );
    expect(directLabel).toBeUndefined();
    expect(playerMessage?.querySelector('.player-message-line')?.textContent).toBe('亨利·格雷：检查书房桌面。');
    expect(playerMessage?.querySelector('.player-inline-name')?.textContent).toBe('亨利·格雷');

    const dmMessage = container.querySelector('.story-message.dm');
    expect(dmMessage?.querySelector('.message-label')?.textContent).toBe('AI DM');
  });
});
