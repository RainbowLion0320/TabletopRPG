import { describe, expect, it } from 'vitest';
import { createInvestigatorFromPreset, presets } from '../../src/data/presets';
import { hydrateGameState } from '../../src/state/gameReducer';
import { evaluateD100, getSkillTotal, prepareCheck } from '../../src/services/dice';
import { makeInvestigator, makeState } from './fixtures';

describe('Dodge percentile correction', () => {
  it('keeps authored allocations and exposes meaningful failure and difficulty boundaries', () => {
    const players = presets.map(createInvestigatorFromPreset);
    expect(players.map(player => getSkillTotal(player, '闪避'))).toEqual([30, 35, 32, 50]);
    const normal = prepareCheck({ player: players[3].name, skill: '闪避', difficulty: '普通' }, players);
    expect(normal.threshold).toBe(50);
    expect(evaluateD100(normal, 50).level).toBe('success');
    expect(evaluateD100(normal, 51).level).toBe('fail');
    expect(prepareCheck({ ...normal, difficulty: '困难' }, players).threshold).toBe(25);
    expect(prepareCheck({ ...normal, difficulty: '极难' }, players).threshold).toBe(10);
  });
  it('migrates a four-player legacy save once while preserving earned points and other state', () => {
    const players = presets.map(createInvestigatorFromPreset);
    players.forEach((player, index) => { player.skills['闪避'] = { base: player.attrs.DEX * 2, added: index === 3 ? 8 : 0, isJob: index === 3 }; });
    const state = makeState({ players });
    state.declarations[players[0].id] = '沿着门廊调查。';
    state.players[0].currentHp -= 2;
    const migrated = hydrateGameState(state);
    expect(migrated.players.map(player => getSkillTotal(player, '闪避'))).toEqual([30, 35, 32, 58]);
    expect(migrated.players[3].skills['闪避'].isJob).toBe(true);
    expect(migrated.players.map(player => player.skills['侦查'])).toEqual(players.map(player => player.skills['侦查']));
    expect(migrated.declarations).toEqual(state.declarations);
    expect(migrated.players[0].currentHp).toBe(players[0].currentHp);
    expect(hydrateGameState(migrated).players).toEqual(migrated.players);
  });
  it('preserves explicit custom bases and numeric totals instead of clamping every high skill', () => {
    const player = makeInvestigator({ name: '自定义调查员', attrs: { ...presets[2].attrs } });
    player.skills['闪避'] = { base: 130, added: 17, isJob: true };
    expect(getSkillTotal(hydrateGameState(makeState({ players: [player] })).players[0], '闪避')).toBe(49);
    player.skills['闪避'] = { base: 90, added: 20, isJob: true };
    expect(getSkillTotal(hydrateGameState(makeState({ players: [player] })).players[0], '闪避')).toBe(110);
    const raw = { ...player, skills: { ...player.skills, 闪避: 120 } };
    expect(getSkillTotal(hydrateGameState({ ...makeState(), players: [raw] }).players[0], '闪避')).toBe(120);
  });
});
