import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NarrativePanel } from '../../src/components/game/NarrativePanel';
import { ActionDock } from '../../src/components/game/ActionDock';
import { makeState } from '../dm/fixtures';
import { getScenarioDefinition } from '../../src/scenario/engine';
import { getPersonColor } from '../../src/services/narrativeMarkup';

describe('NarrativePanel', () => {
  it('keeps hints and identity colors separate across messages and refreshes known places while preserving draft renders', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    const text = '亨利查看码头附近的水里的东西，进行侦查。';
    state.messages = [
      { id: 'hinted', type: 'dm', text, keywords: [{ text: '水里的东西', kind: 'clue' }] },
      { id: 'unhinted', type: 'dm', text },
      { id: 'player', type: 'player', text, playerName: '亨利', keywords: [{ text: '水里的东西', kind: 'clue' }] }
    ];
    const firstOpen = vi.fn(), nextOpen = vi.fn();
    const { container, rerender } = render(<NarrativePanel state={state} onMarkOpen={firstOpen} />);
    const story = container.querySelector('.narrative-scroll')!;
    expect(story.querySelectorAll('.narrative-mark-inferred')).toHaveLength(1);
    expect(story.querySelectorAll('.narrative-mark-location')).toHaveLength(0);
    for (const person of story.querySelectorAll<HTMLElement>('.narrative-mark-person')) {
      expect(person.style.getPropertyValue('--person-color')).toBe(getPersonColor(state, '亨利'));
    }
    const before = story.innerHTML;
    rerender(<NarrativePanel state={{ ...state, declarations: { [state.players[0].id]: '写下第二行行动。' } }} onMarkOpen={nextOpen} />);
    expect(story.innerHTML).toBe(before);
    fireEvent.click(story.querySelector('.narrative-mark-person')!);
    expect(firstOpen).not.toHaveBeenCalled();
    expect(nextOpen).toHaveBeenCalledWith(expect.objectContaining({ canonicalName: '亨利' }), text);
    // A preparation is scoped to a render, not a global cache keyed by object identity.
    state.currentScene = 'S05';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    expect(story.querySelectorAll('.narrative-mark-location')).toHaveLength(3);
    expect(story.querySelectorAll('.narrative-mark-inferred')).toHaveLength(1);
    expect(story.querySelector('[data-message-id="unhinted"] p')?.textContent).toBe(text);
    // The same stored record can receive edited hints or replacement text.
    state.messages[0].keywords![0].kind = 'danger';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    expect(story.querySelector('.narrative-mark-inferred')?.classList).toContain('narrative-mark-danger');
    state.messages[0].text = '亨利查看码头旁的暗红血迹与小册子。';
    state.messages[0].keywords![0].text = '暗红血迹';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    expect(story.querySelector('[data-message-id="hinted"] p')?.textContent).toBe(state.messages[0].text);
    expect(story.querySelector('.narrative-mark-inferred')?.textContent).toBe('暗红血迹');
    state.messages[0].keywords = [];
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    expect(story.querySelectorAll('.narrative-mark-inferred')).toHaveLength(0);
    expect(story.querySelectorAll('.narrative-mark-item')).toHaveLength(0);
    state.clues.push({ id: 'I04', name: '小册子', scene: 'S05', desc: '', found: true });
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    expect(story.querySelector('.narrative-mark-item')?.textContent).toBe('小册子');
    state.players[0].name = '新调查员';
    state.messages[0].text = '新调查员查看小册子。';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    const person = story.querySelector<HTMLElement>('[data-message-id="hinted"] .narrative-mark-person')!;
    expect(person.textContent).toBe('新调查员');
    expect(person.style.getPropertyValue('--person-color')).toBe(getPersonColor(state, '新调查员'));
  });

  it('keeps story and dice in the narrative and moves connection feedback to the retry dock', () => {
    const state = makeState();
    const cues = getScenarioDefinition().progression.storyEvents.map((event) => event.narrativeCue);
    state.messages = [
      ...cues.map((text, index) => ({ id: `cue-${index}`, type: 'system' as const, text })),
      { id: 'dm', type: 'dm', text: cues[0] },
      { id: 'dice', type: 'system', text: '检定结果：大失败（100）' },
      { id: 'error', type: 'system', text: 'AI DM 连接失败：请检查网络。' }
    ];
    const { container } = render(<NarrativePanel state={state} />);

    expect(container.querySelectorAll('.story-message.system')).toHaveLength(1);
    expect(container.querySelector('.story-message.dm p')?.textContent).toBe(cues[0]);
    expect(container.textContent).toContain('检定结果：大失败（100）');
    expect(container.textContent).not.toContain('AI DM 连接失败：请检查网络。');
    state.pendingDmActions = [{ player: state.players[0].name, action: '继续谈话' }];
    render(<ActionDock state={state} isDiceRolling={false} onDeclarationChange={vi.fn()} onSubmit={vi.fn()}
      onRoll={vi.fn()} onSuggestion={vi.fn()} onInspectPlayer={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('检查网络或 AI 设置');
  });

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

  it('keeps cached player lines current across draft edits, identity changes and corrected messages', () => {
    const state = makeState();
    const player = state.players[0];
    state.messages = [{ id: 'player-line', type: 'player', playerName: player.name, text: '检查门廊。' }];
    const firstOpen = vi.fn(), nextOpen = vi.fn();
    const { rerender } = render(<NarrativePanel state={state} onMarkOpen={firstOpen} />);
    rerender(<NarrativePanel state={{ ...state, declarations: { [player.id]: '保留多行草稿。' } }} onMarkOpen={nextOpen} />);
    fireEvent.click(screen.getByRole('button', { name: `查看${player.name}详情` }));
    expect(firstOpen).not.toHaveBeenCalled();
    expect(nextOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: player.id, canonicalName: player.name }), '检查门廊。');
    player.id = 'replacement-player';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    fireEvent.click(screen.getByRole('button', { name: `查看${player.name}详情` }));
    expect(nextOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'replacement-player', canonicalName: player.name }), '检查门廊。');
    player.name = '新的调查员';
    state.messages[0].playerName = player.name;
    state.messages[0].text = '补充窗边观察。';
    rerender(<NarrativePanel state={state} onMarkOpen={nextOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '查看新的调查员详情' }));
    expect(nextOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'replacement-player', canonicalName: '新的调查员' }), '补充窗边观察。');
    expect(screen.getByText('补充窗边观察。')).toBeInTheDocument();
    expect(screen.queryByText('检查门廊。')).toBeNull();
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
    expect(paragraph?.querySelector('.narrative-mark-skill')?.tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: '查看心理学详情' })).not.toBeInTheDocument();
    expect(container.querySelector('[style*="background"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '查看水里的东西详情' }));
    expect(onMarkOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'llm', kind: 'clue' }),
      state.messages[0].text
    );
  });

  it('emphasizes dice outcomes without exposing empty detail controls', () => {
    const state = makeState();
    state.messages = [{ id: 'dice-result', type: 'system', text: '检定结果：普通成功（42）' }];

    const { container } = render(<NarrativePanel state={state} />);

    expect(container.querySelector('.narrative-mark-success')?.textContent).toBe('普通成功');
    expect(container.querySelector('.narrative-mark-success')?.tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: '查看普通成功详情' })).not.toBeInTheDocument();
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

  it('preserves a reader in older history, ignores internal updates, and lets them jump to the start of the new reply', () => {
    const state = makeState();
    state.messages = [{ id: 'old', type: 'dm', text: '以前的谈话。' }, { id: 'current', type: 'dm', text: '当前的谈话。' }];
    const { rerender } = render(<NarrativePanel state={state} />);
    const panel = screen.getByRole('region', { name: '剧情记录' });
    Object.defineProperties(panel, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 1600 } });
    Object.defineProperty(panel.querySelector('[data-message-id="current"]'), 'offsetTop', { configurable: true, value: 1000 });
    panel.scrollTop = 80;
    fireEvent.scroll(panel);
    const scrollTo = vi.mocked(panel.scrollTo);
    scrollTo.mockClear();
    const internalState = { ...state, messages: [...state.messages, { id: 'internal', type: 'system' as const, text: 'AI DM 返回格式无效：内部恢复' }] };
    rerender(<NarrativePanel state={internalState} />);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '查看新剧情' })).not.toBeInTheDocument();
    const next = { ...internalState, messages: [...internalState.messages, { id: 'new', type: 'dm' as const, text: '新的长回复。' }] };
    rerender(<NarrativePanel state={next} />);
    expect(panel.scrollTop).toBe(80);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(panel.querySelector('[data-message-id="new"]'), 'offsetTop', { configurable: true, value: 1300 });
    fireEvent.click(screen.getByRole('button', { name: '查看新剧情' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1300, behavior: 'auto' });
    expect(panel).toHaveFocus();
    expect(screen.queryByRole('button', { name: '查看新剧情' })).not.toBeInTheDocument();
  });

  it('preserves the actual reading position when a reply arrives before the queued scroll event', () => {
    const state = makeState();
    state.messages = [{ id: 'old', type: 'dm', text: '此前的记录。' }, { id: 'current', type: 'dm', text: '当前的记录。' }];
    const { rerender } = render(<NarrativePanel state={state} />);
    const panel = screen.getByRole('region', { name: '剧情记录' });
    Object.defineProperties(panel, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 1600 } });
    Object.defineProperty(panel.querySelector('[data-message-id="current"]'), 'offsetTop', { configurable: true, value: 1000 });
    rerender(<NarrativePanel state={{ ...state }} />);
    const scrollTo = vi.mocked(panel.scrollTo); scrollTo.mockClear();
    panel.scrollTop = 80; // The browser has moved, but onScroll has not run yet.
    rerender(<NarrativePanel state={{ ...state, messages: [...state.messages, { id: 'new', type: 'dm', text: '刚到达的回复。' }] }} />);
    expect(panel.scrollTop).toBe(80); expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '查看新剧情' })).toBeVisible();
    Object.defineProperty(panel.querySelector('[data-message-id="new"]'), 'offsetTop', { configurable: true, value: 1300 });
    fireEvent.scroll(panel);
    expect(panel.scrollTop).toBe(80); expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '查看新剧情' })).toBeVisible();
  });

  it('follows new entries when reading the latest reply, and resumes from a replacement save without an unread badge', () => {
    const state = makeState();
    state.messages = [{ id: 'old', type: 'dm', text: '以前。' }, { id: 'latest', type: 'dm', text: '当前。' }];
    const { rerender } = render(<NarrativePanel state={state} />);
    const panel = screen.getByRole('region', { name: '剧情记录' });
    Object.defineProperties(panel, { clientHeight: { configurable: true, value: 200 }, scrollHeight: { configurable: true, value: 1600 } });
    Object.defineProperty(panel.querySelector('[data-message-id="latest"]'), 'offsetTop', { configurable: true, value: 1000 });
    panel.scrollTop = 1100;
    fireEvent.scroll(panel);
    const scrollTo = vi.mocked(panel.scrollTo);
    scrollTo.mockClear();
    const next = { ...state, messages: [...state.messages, { id: 'new', type: 'dm' as const, text: '继续。' }] };
    rerender(<NarrativePanel state={next} />);
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '查看新剧情' })).not.toBeInTheDocument();
    Object.defineProperty(panel.querySelector('[data-message-id="new"]'), 'offsetTop', { configurable: true, value: 1300 });
    panel.scrollTop = 0;
    fireEvent.scroll(panel);
    scrollTo.mockClear();
    rerender(<NarrativePanel state={{ ...state, messages: [{ id: 'save', type: 'dm', text: '另一份存档。' }] }} />);
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '查看新剧情' })).not.toBeInTheDocument();
  });
});
