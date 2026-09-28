import { describe, expect, it } from 'vitest';
import { demandedCheckClauses, recoverNarratedChecks } from '../../src/dm/narratedChecks';
import { makeInvestigator, makeState } from './fixtures';

const ada = makeInvestigator({ name: '艾达·华莱士' }, { 潜行: 40, 侦查: 50, 聆听: 55 });
const henry = makeInvestigator({ name: '亨利·格雷' }, { 潜行: 60, 侦查: 70 });
const state = makeState({ players: [ada, henry] });
const actions = [{ player: ada.name, action: '伸手拿走纸条，不引起灰风衣男人注意。' }];

describe('narrated check recovery', () => {
  it.each([
    '这次不需要进行潜行检定。', '你不必检定，直接拿起即可。',
    '如果你继续冒险，需要进行潜行检定。', '刚才需要进行的潜行检定已经结束。',
    '你可以选择之后再掷骰。', '你无需进行检定。', '接下来可能需要潜行检定。', '这未必需要潜行检定。',
    '需要注意，这里无需进行潜行检定，直接拿起即可。', '请不要进行潜行检定，直接拿起即可。',
    '你需要先征求同意，之后再进行潜行检定。', '请稍后进行潜行检定。', '需要等他回来再进行潜行检定。'
  ])('does not demand a die for %s', (text) => {
    expect(demandedCheckClauses(text)).toEqual([]);
  });

  it('connects the named acting investigator and explicit difficulty to a real check', () => {
    const checks = recoverNarratedChecks({
      narrative: '艾达需要进行困难潜行检定，判定能否避过对方目光。', nextPrompt: '请进行困难潜行检定。'
    }, [], state, actions);
    expect(checks).toEqual([{ name: 'request_check', arguments: {
      player: ada.name, skill: '潜行', difficulty: '困难', reason: expect.any(String)
    } }]);
  });

  it('keeps independently named multiplayer requests in order', () => {
    expect(recoverNarratedChecks({ narrative: '艾达需要进行聆听检定。亨利需要进行困难侦查检定。', nextPrompt: '' }, [], state,
      [...actions, { player: henry.name, action: '留意街角' }]
    ).map((call) => [call.arguments.player, call.arguments.skill])).toEqual([[ada.name, '聆听'], [henry.name, '侦查']]);
  });

  it('does not guess between players, skills or invent a new skill', () => {
    for (const narrative of ['需要进行潜行或侦查检定。', '需要进行魔法洞察检定。', '亨利需要进行潜行检定。']) {
      expect(recoverNarratedChecks({ narrative, nextPrompt: '' }, [], state, actions)).toEqual([]);
    }
    expect(recoverNarratedChecks({ narrative: '需要进行潜行检定。', nextPrompt: '' }, [], state,
      [...actions, { player: henry.name, action: '跟在后面' }]
    )).toEqual([]);
  });

  it('completes a partially supplied batch without replacing explicit difficulty or duplicating dice', () => {
    const output = { narrative: '艾达需要进行聆听检定，亨利需要进行困难侦查检定。', nextPrompt: '亨利需要进行困难侦查检定。' };
    expect(recoverNarratedChecks(output, [{ name: 'request_check', arguments: {
      player: ada.name, skill: '聆听', difficulty: '极难'
    } }], state, [...actions, { player: henry.name, action: '留意街角' }])).toEqual([
      { name: 'request_check', arguments: { player: henry.name, skill: '侦查', difficulty: '困难', reason: expect.any(String) } }
    ]);
  });

  it('never duplicates an existing tool or re-rolls a settled action', () => {
    const output = { narrative: '艾达需要进行潜行检定。', nextPrompt: '' };
    expect(recoverNarratedChecks(output, [{ name: 'request_check', arguments: { player: ada.name, skill: '潜行', difficulty: '极难' } }], state, actions)).toEqual([]);
    expect(recoverNarratedChecks(output, [], state, [{ player: ada.name, action: '【检定结果】潜行失败' }])).toEqual([]);
    expect(recoverNarratedChecks(output, [{ name: 'propose_story_event', arguments: { eventId: 'EV_CHOOSE_NEGOTIATION' } }], state, actions)).toEqual([]);
  });
});
