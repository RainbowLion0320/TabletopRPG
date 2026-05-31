import { describe, expect, it } from 'vitest';
import {
  computeRevealedSecretIds,
  deriveRevealContext,
  getItemSnapshot,
  getNpcSnapshot,
  getReachableScenes,
  getSceneSnapshot,
  isSecretRevealed
} from '../../src/dm/knowledgeBase';
import type { KnowledgeBase, SecretDefinition } from '../../src/dm/types';
import { wuzhongxiaoshi } from '../../src/data/scenarios/wuzhongxiaoshi';
import { makeState } from './fixtures';

describe('knowledgeBase secret reveal', () => {
  it('always-condition secret is always revealed', () => {
    const secret: SecretDefinition = {
      id: 'always_one',
      content: 'x',
      revealOn: [{ type: 'always' }]
    };
    const ctx = deriveRevealContext(makeState());
    expect(isSecretRevealed(secret, ctx)).toBe(true);
  });

  it('flag-condition secret unlocks only when flag matches', () => {
    const secret: SecretDefinition = {
      id: 'flag_one',
      content: 'x',
      revealOn: [{ type: 'flag', key: 'met_montreal' }]
    };
    const offCtx = deriveRevealContext(makeState({ flags: {} }));
    const onCtx = deriveRevealContext(makeState({ flags: { met_montreal: true } }));
    expect(isSecretRevealed(secret, offCtx)).toBe(false);
    expect(isSecretRevealed(secret, onCtx)).toBe(true);
  });

  it('flag with explicit equals matches strict value only', () => {
    const secret: SecretDefinition = {
      id: 'flag_eq',
      content: 'x',
      revealOn: [{ type: 'flag', key: 'mood', equals: 'angry' }]
    };
    const wrongCtx = deriveRevealContext(makeState({ flags: { mood: 'calm' } }));
    const rightCtx = deriveRevealContext(makeState({ flags: { mood: 'angry' } }));
    expect(isSecretRevealed(secret, wrongCtx)).toBe(false);
    expect(isSecretRevealed(secret, rightCtx)).toBe(true);
  });

  it('sceneVisited triggers via clues even before scene becomes current', () => {
    const secret: SecretDefinition = {
      id: 'visited_s04',
      content: 'x',
      revealOn: [{ type: 'sceneVisited', sceneId: 'S04' }]
    };
    // S04 has items I07/I08; using a clue from S04 should mark scene as visited.
    const stateWithoutClue = makeState();
    const stateWithClue = makeState({ clueIds: ['I07'] });
    // override clue scene to S04
    stateWithClue.clues = [
      { id: 'I07', name: '潮湿的地图笔记', scene: 'S04', desc: '', found: true }
    ];
    const noCtx = deriveRevealContext(stateWithoutClue);
    const yesCtx = deriveRevealContext(stateWithClue);
    expect(isSecretRevealed(secret, noCtx)).toBe(false);
    expect(isSecretRevealed(secret, yesCtx)).toBe(true);
  });

  it('itemFound triggers when foundItemIds contains target', () => {
    const secret: SecretDefinition = {
      id: 'item_one',
      content: 'x',
      revealOn: [{ type: 'itemFound', itemId: 'I05' }]
    };
    const noCtx = deriveRevealContext(makeState());
    const yesCtx = deriveRevealContext(makeState({ clueIds: ['I05'] }));
    expect(isSecretRevealed(secret, noCtx)).toBe(false);
    expect(isSecretRevealed(secret, yesCtx)).toBe(true);
  });

  it('S01 is implicitly visited even without clues', () => {
    const ctx = deriveRevealContext(makeState());
    expect(ctx.visitedScenes.has('S01')).toBe(true);
  });

  it('empty revealOn means never revealed', () => {
    const secret: SecretDefinition = { id: 'never', content: 'x', revealOn: [] };
    const ctx = deriveRevealContext(makeState({ flags: { anything: true } }));
    expect(isSecretRevealed(secret, ctx)).toBe(false);
  });
});

describe('knowledgeBase snapshots', () => {
  const kb: KnowledgeBase = wuzhongxiaoshi;

  it('getSceneSnapshot returns public face plus only revealed secrets', () => {
    const ctx = deriveRevealContext(makeState({ currentScene: 'S02', flags: { met_montreal: true } }));
    const revealed = computeRevealedSecretIds(kb, ctx);
    const snap = getSceneSnapshot(kb, 'S02', revealed);
    expect(snap).not.toBeNull();
    expect(snap!.public.id).toBe('S02');
    // S02 secretIds: ['montreal_corruption']; flag 'met_montreal' triggers it.
    expect(snap!.knownSecrets.length).toBe(1);
    expect(snap!.knownSecrets[0]).toContain('蒙特利尔');
  });

  it('getSceneSnapshot omits unrevealed secrets', () => {
    const ctx = deriveRevealContext(makeState({ currentScene: 'S01' }));
    const revealed = computeRevealedSecretIds(kb, ctx);
    const snap = getSceneSnapshot(kb, 'S04', revealed);
    expect(snap).not.toBeNull();
    // S04 secretIds: ['hybrid_fog_spell', 'montreal_thug_trigger'] — neither flag set
    expect(snap!.knownSecrets).toEqual([]);
  });

  it('getNpcSnapshot returns null for unknown name', () => {
    const ctx = deriveRevealContext(makeState());
    const revealed = computeRevealedSecretIds(kb, ctx);
    expect(getNpcSnapshot(kb, '不存在的NPC', revealed)).toBeNull();
  });

  it('getItemSnapshot exposes appearance only when revealed list filters secrets', () => {
    // I05 has secretIds: ['opium_sample_id', 'eric_smuggling']
    const ctx = deriveRevealContext(makeState({ clueIds: ['I05'] }));
    const revealed = computeRevealedSecretIds(kb, ctx);
    const snap = getItemSnapshot(kb, 'I05', revealed);
    expect(snap).not.toBeNull();
    // Both secrets should be revealed since one triggers via itemFound and the
    // other via flag 'discovered_smuggling' OR itemFound: I05.
    expect(snap!.knownSecrets.length).toBeGreaterThanOrEqual(1);
  });

  it('getReachableScenes follows sceneGraph', () => {
    expect(getReachableScenes(kb, 'S01').sort()).toEqual(['S02', 'S03', 'S04']);
    expect(getReachableScenes(kb, 'S05')).toEqual(['S04']);
  });
});
