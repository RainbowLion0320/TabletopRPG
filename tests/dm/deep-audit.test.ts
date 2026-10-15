import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import { callNarrator } from '../../src/dm/narrator';
import { buildDmContext } from '../../src/dm/contextBuilder';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { inferNarrativeConsequences, reviewNarratorSemantics } from '../../src/dm/turnGuards';
import { createScenarioProgress } from '../../src/scenario/engine';
import { makeInvestigator, makeState } from './fixtures';
import type { ApiConfig, CheckContinuationAction } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai', protocol: 'responses', apiKey: 'unit-test-key',
  model: 'unit-test-model', endpoint: 'https://unit.test/v1'
};

function response(text: string, calls: unknown[] = []) {
  return new Response(JSON.stringify({ output_text: text, output: calls }), { status: 200 });
}

function prose(narrative: string) {
  return JSON.stringify({ narrative, activeNpc: null, nextPrompt: '', playerChoices: {}, keywords: [] });
}

function providerResponse(protocol: 'responses' | 'chat-completions', text: string, calls: Array<{ callId: string; name: string; arguments: Record<string, unknown> }> = []) {
  return protocol === 'responses'
    ? response(text, calls.map((call) => ({ type: 'function_call', call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments) })))
    : new Response(JSON.stringify({ choices: [{ message: {
        role: 'assistant', content: text, tool_calls: calls.map((call) => ({
          id: call.callId, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) }
        }))
      } }] }), { status: 200 });
}

function mockNarrative(narrative: string) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return response(body.text?.format?.name === 'narrator_response'
      ? prose(narrative) : JSON.stringify({ facts: [], nodes: [], edges: [] }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('deep audit: state fidelity and unobstructed narration', () => {
  it.each([
    '你的手没有受伤，衣袖也完好无损。',
    '你的手套沾上了陌生人的血痕，你本人毫发无损。',
    '你的旧伤已经愈合，没有再次流血。',
    '碎玻璃险些划伤你的手臂。',
    '如果碎片划伤了你的手臂，你就需要找医生。',
    '你的手臂被玻璃划伤的风险已经消除。'
  ])('does not silently charge HP for harmless prose: %s', async (narrative) => {
    mockNarrative(narrative);
    const result = await runDmTurn(config, {
      state: makeState(), actions: [{ player: '亨利', action: '原地思考。' }]
    });
    await result.backgroundUpdate;
    expect(result.legacyResponse?.stateUpdate?.hp).toEqual({});
  });

  it('does not apply the distant finale encounter gate to an ordinary local threat', async () => {
    const narrative = '窗扇被风吹得来回摇晃。你扣好窗闩，玻璃掉落的威胁已经解除，屋内重新安静下来。';
    const fetchMock = mockNarrative(narrative);
    const result = await runDmTurn(config, {
      state: makeState({ currentScene: 'S01' }),
      actions: [{ player: '亨利', action: '扣好被风吹开的窗闩。' }]
    });
    await result.backgroundUpdate;
    expect(result.legacyResponse?.narrative).toBe(narrative);
    expect(fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes('narrator_response'))).toHaveLength(1);
  });

  it.each([
    '你的手臂被碎玻璃划伤。',
    '锋利的碎片划伤了你的手臂。',
    '你的手臂流血。'
  ])('retains definite physical injury: %s', (narrative) => {
    const state = makeState();
    expect(inferNarrativeConsequences({ narrative }, [{ player: '亨利', action: '推开窗户' }], state).stateUpdate?.hp).toEqual({ 亨利: -1 });
  });

  it('distinguishes a local obstacle from defeating an active finale encounter', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    const output = { narrative: '松动的木板被固定，绊倒的威胁已经解除。', nextPrompt: '', playerChoices: {} };
    expect(reviewNarratorSemantics(output, [], state, getActiveKnowledgeBase())?.severity).not.toBe('blocking');
    expect(reviewNarratorSemantics({ ...output, narrative: '所有深潜者都失去战斗能力。' }, [], state, getActiveKnowledgeBase())?.severity).toBe('blocking');
  });

  it('accepts only the injury covered by this actor’s settled receipt, preserving explicit new damage', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })] });
    const actions: CheckContinuationAction[] = [{
      player: '亨利', action: '【检定结果】亨利 的 格斗（拳） 检定：结果：大失败。',
      checkResult: { skill: '格斗（拳）', outcome: 'fumble', settledResources: { hp: -1 } }
    }];
    const output = { narrative: '亨利的手臂受伤，退回掩体。', nextPrompt: '', playerChoices: {} };
    expect(reviewNarratorSemantics(output, [], state, getActiveKnowledgeBase(), actions)?.severity).not.toBe('blocking');
    expect(inferNarrativeConsequences(output, actions, state).stateUpdate?.hp).toEqual({});
    expect(inferNarrativeConsequences({ ...output, stateUpdate: { hp: { 亨利: -2 } } }, actions, state).stateUpdate?.hp).toEqual({ 亨利: -2 });
    expect(reviewNarratorSemantics({ ...output, narrative: '艾达的手臂受伤，退回掩体。' }, [], state, getActiveKnowledgeBase(), actions)?.severity).toBe('blocking');

    const withoutReceipt: CheckContinuationAction[] = [{ ...actions[0], checkResult: { skill: '格斗（拳）', outcome: 'fumble' } }];
    expect(reviewNarratorSemantics(output, [], state, getActiveKnowledgeBase(), withoutReceipt)?.severity).toBe('blocking');
    expect(inferNarrativeConsequences(output, withoutReceipt, state).stateUpdate?.hp).toEqual({ 亨利: -1 });
  });

  it.each(['responses', 'chat-completions'] as const)('%s preserves staged tools and their receipts during JSON repair', async (protocol) => {
    const check = { player: '亨利', skill: '机械维修', difficulty: '普通', reason: '复杂门锁' };
    const calls = [{ callId: 'check-lock', name: 'request_check', arguments: check }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerResponse(protocol, '', calls))
      .mockResolvedValueOnce(providerResponse(protocol, 'not a narrator json object'))
      .mockResolvedValueOnce(providerResponse(protocol, prose('门锁的结构很复杂，你谨慎地试探着锁芯。')));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState();
    const validateOutput = vi.fn(() => null);
    const result = await callNarrator({ ...config, protocol }, {
      ctx: buildDmContext(state, getActiveKnowledgeBase(), { checkPlayer: '亨利', relevantSkills: [] }),
      history: [], actions: [{ player: '亨利', action: '试探锁芯。' }], validateOutput
    });
    expect(result.toolCalls).toContainEqual(expect.objectContaining({ name: 'request_check', arguments: check }));
    expect(result.toolCalls).toHaveLength(1);
    expect(validateOutput).toHaveBeenCalledWith(expect.anything(), result.toolCalls);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(JSON.stringify(repairBody.input ?? repairBody.messages)).toContain('check-lock');
    expect(JSON.stringify(repairBody.input ?? repairBody.messages)).toContain('pending');
    expect(repairBody.tools).toBeUndefined();
  });

  it('retains valid tools delivered alongside malformed prose', async () => {
    const check = { player: '亨利', skill: '机械维修', difficulty: '普通' };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(providerResponse('responses', 'not a narrator json object', [{ callId: 'check-lock', name: 'request_check', arguments: check }]))
      .mockResolvedValueOnce(response(prose('门锁的结构很复杂，你谨慎地试探着锁芯。'))));
    const state = makeState();
    const result = await callNarrator(config, {
      ctx: buildDmContext(state, getActiveKnowledgeBase(), {}),
      history: [], actions: [{ player: '亨利', action: '试探锁芯。' }]
    });
    expect(result.toolCalls).toEqual([expect.objectContaining({ name: 'request_check', arguments: check })]);
  });

  it('discards the old proposal and receipt when semantic review requires a new response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerResponse('responses', '', [{ callId: 'old-check', name: 'request_check', arguments: { player: '亨利', skill: '机械维修', difficulty: '普通' } }]))
      .mockResolvedValueOnce(response(prose('待修正叙事。')))
      .mockResolvedValueOnce(response(prose('修正后的叙事。')));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState();
    const result = await callNarrator(config, {
      ctx: buildDmContext(state, getActiveKnowledgeBase(), {}), history: [],
      actions: [{ player: '亨利', action: '试探锁芯。' }],
      validateOutput: (output) => output.narrative === '待修正叙事。' ? { severity: 'blocking', message: '需要重新裁决' } : null
    });
    expect(result.toolCalls).toEqual([]);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(JSON.stringify(retryBody.input)).not.toContain('old-check');
    expect(retryBody.tools).toBeDefined();
  });
});
