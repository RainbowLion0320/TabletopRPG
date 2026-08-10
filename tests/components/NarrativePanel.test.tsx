import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders deterministic and LLM marks without changing the original text', () => {
    const state = makeState();
    state.messages = [{
      id: 'm-rich',
      type: 'dm',
      text: '伊莎贝拉·摩勒在摩勒住宅提到水里的东西，建议进行心理学检定。',
      keywords: [{ text: '水里的东西', kind: 'clue' }]
    }];
    const onMarkOpen = vi.fn();
    const { container } = render(<NarrativePanel state={state} onMarkOpen={onMarkOpen} />);

    const paragraph = container.querySelector('.story-message.dm p');
    expect(paragraph?.textContent).toBe(state.messages[0].text);
    expect(paragraph?.querySelector('.narrative-mark-person')?.textContent).toBe('伊莎贝拉·摩勒');
    expect(paragraph?.querySelector('.narrative-mark-location')?.textContent).toBe('摩勒住宅');
    expect(paragraph?.querySelector('.narrative-mark-clue')?.textContent).toBe('水里的东西');
    expect(paragraph?.querySelector('.narrative-mark-skill')?.textContent).toBe('心理学');
    expect(container.querySelector('[style*="background"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '查看水里的东西详情' }));
    expect(onMarkOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'llm', kind: 'clue' }),
      state.messages[0].text
    );
  });

  it('hides internal progression prompts while keeping other system feedback', () => {
    const state = makeState();
    state.messages = [
      { id: 'internal-hint', type: 'system', text: '推进提示：检查书桌抽屉。' },
      { id: 'dice-result', type: 'system', text: '检定结果：普通成功（42）' }
    ];

    const { container } = render(<NarrativePanel state={state} />);

    expect(screen.queryByText('推进提示：检查书桌抽屉。')).not.toBeInTheDocument();
    expect(container.querySelector('.story-message.system')?.textContent).toBe('检定结果：普通成功（42）');
  });
});
