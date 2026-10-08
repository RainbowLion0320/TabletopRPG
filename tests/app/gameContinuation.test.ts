import { describe, expect, it } from 'vitest';
import { captureGameContinuation, continuationPreview } from '../../src/app/gameContinuation';
import { makeInvestigator, makeState } from '../dm/fixtures';
import { evaluateD100, prepareCheck } from '../../src/services/dice';

describe('suspended investigation checkpoints', () => {
  it('retains drafts, party actor, pending action and history without mutating the live thinking state', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })] });
    state.isThinking = true; state.currentActorIndex = 1;
    state.declarations[state.players[1].id] = '继续查看窗框。';
    state.pendingDmActions = [{ player: state.players[0].name, action: '询问访客' }];
    const checkpoint = captureGameContinuation(state, null);
    expect(checkpoint.state.isThinking).toBe(false); expect(state.isThinking).toBe(true);
    expect(checkpoint.state.declarations).toEqual(state.declarations);
    expect(checkpoint.state.pendingDmActions).toEqual(state.pendingDmActions);
    expect(checkpoint.state.currentActorIndex).toBe(1); expect(checkpoint.state.messages).toEqual(state.messages);
  });
  it('retains the exact locked die alongside its original check', () => {
    const state = makeState(); state.pendingCheck = prepareCheck({ player: state.players[0].name, skill: '侦查', difficulty: '普通' }, state.players);
    const roll = { phase: 'revealed' as const, check: state.pendingCheck, result: evaluateD100(state.pendingCheck, 100) };
    const checkpoint = captureGameContinuation(state, roll);
    expect(checkpoint.roll?.result.roll).toBe(100); expect(checkpoint.roll?.check).toEqual(state.pendingCheck);
    expect(checkpoint.state.pendingCheck).toEqual(state.pendingCheck);
  });
  it('previews only the current scene, party and public world time', () => {
    const state = makeState(); state.flags.internalSecret = 'secret';
    expect(continuationPreview(state)).toEqual({ label: '当前调查', scene: '摩勒住宅', players: state.players.map(p => p.name).join('、'), detail: '1920-07-13 17:30' });
  });
});
