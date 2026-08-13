import { describe, expect, it } from 'vitest';
import {
  buildPersonColorMap,
  markNarrativeText,
  type NarrativeMarkTarget
} from '../../src/services/narrativeMarkup';
import { getNarrativeMarkDetail } from '../../src/dm/entityDetail';
import { makeInvestigator, makeState } from '../dm/fixtures';

describe('narrative markup', () => {
  it('prefers full deterministic entities over aliases and overlapping LLM hints', () => {
    const state = makeState({ clueIds: ['I04'] });
    const text = '伊莎贝拉·摩勒握着小册子，要求进行心理学检定。';
    const segments = markNarrativeText(text, state, [
      { text: '伊莎贝拉·摩勒握着小册子', kind: 'clue' },
      { text: '小册子', kind: 'danger' }
    ]);

    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    expect(segments.filter((segment) => segment.mark).map((segment) => [
      segment.text,
      segment.mark?.kind,
      segment.mark?.source
    ])).toEqual([
      ['伊莎贝拉·摩勒', 'person', 'deterministic'],
      ['小册子', 'item', 'deterministic'],
      ['心理学', 'skill', 'deterministic']
    ]);
  });

  it('maps a safe alias to its canonical person', () => {
    const state = makeState({ activeNpcName: '洛夫·蒙特利尔' });
    const marked = markNarrativeText('蒙特利尔局长拒绝回答。', state);
    const person = marked.find((segment) => segment.mark?.kind === 'person');

    expect(person?.text).toBe('蒙特利尔局长');
    expect(person?.mark?.canonicalName).toBe('洛夫·蒙特利尔');
  });

  it('does not link aliases for a future scene before that scene is revealed', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    const text = '酒保说港口可能有水手，码头的雾也很重。';

    const hidden = markNarrativeText(text, state);
    expect(hidden.filter((segment) => segment.mark?.kind === 'location')).toEqual([]);

    state.currentScene = 'S05';
    state.playerLocations = Object.fromEntries(state.players.map((player) => [player.id, 'S05']));
    const revealed = markNarrativeText(text, state);
    expect(revealed.filter((segment) => segment.mark?.kind === 'location').map((segment) => segment.text))
      .toEqual(['港口', '码头']);
  });

  it('assigns stable distinct colors while the palette has capacity', () => {
    const players = [
      makeInvestigator({ id: 'henry', name: '亨利·格雷' }),
      makeInvestigator({ id: 'ada', name: '艾达·华莱士' })
    ];
    const state = makeState({ players });
    const first = buildPersonColorMap(state);
    const second = buildPersonColorMap(state);

    expect(first).toEqual(second);
    expect(new Set(first.values()).size).toBe(first.size);
  });

  it('does not include LLM hints for player and system messages when disabled', () => {
    const state = makeState();
    const segments = markNarrativeText(
      '水里的东西靠近亨利。',
      state,
      [{ text: '水里的东西', kind: 'danger' }],
      false
    );

    expect(segments.find((segment) => segment.text === '水里的东西')?.mark).toBeUndefined();
    expect(segments.find((segment) => segment.text === '亨利')?.mark?.kind).toBe('person');
  });

  it('does not expose unlocked secrets or unknown counts for an NPC not formally met', () => {
    const state = makeState({ clueIds: ['I05'], activeNpcName: null });
    const target: NarrativeMarkTarget = {
      kind: 'person',
      id: '埃里克·摩勒',
      label: '埃里克·摩勒',
      canonicalName: '埃里克·摩勒',
      source: 'deterministic'
    };

    const detail = getNarrativeMarkDetail(target, state, '委托人提到了埃里克·摩勒。');
    expect(detail?.knownSecrets).toEqual([]);
    expect(detail?.unknownCount).toBe(0);
  });
});
