import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNarrator, buildNarratorPromptParts, buildNarratorSystemPrompt } from '../../src/dm/narrator';
import { buildDmContext } from '../../src/dm/contextBuilder';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { validateToolCalls, allowedTools } from '../../src/dm/director';
import { classifyIntent } from '../../src/dm/intentClassifier';
import { makeInvestigator, makeState } from './fixtures';
import type { ApiConfig } from '../../src/types/game';

const config: ApiConfig = { provider: 'mimo', protocol: 'responses', model: 'mimo-v2.6-flash', endpoint: 'https://unit.test/v1', apiKey: 'tp-test-only' };
afterEach(() => vi.unstubAllGlobals());
describe('one complete turn preserves the original game authority and party freedom', () => {
  it.each([1, 2, 4])('returns all %i players and proposals in one request, without an acknowledgement round', async count => {
    const players = ['亨利', '艾达', '托马斯', '罗伯特'].slice(0, count).map(name => makeInvestigator({ name }));
    const state = makeState({ players }), kb = getActiveKnowledgeBase();
    const actions = players.map(player => ({ player: player.name, action: '查看自己携带的工具。' }));
    const proposals = players.map(player => ({ name: 'request_check', arguments: { player: player.name, skill: '机械维修', difficulty: '普通', reason: '修理复杂的自备器械' } }));
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.model).toBe('mimo-v2.6-flash');
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.tools.map((tool: { name: string }) => tool.name)).toContain('narrate_turn');
      expect(body.tools.map((tool: { name: string }) => tool.name)).toContain('request_check');
      expect(body.input[0]).toMatchObject({ role: 'system' });
      expect(body.instructions).toContain('keywords 最多 6 个');
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'function_call', call_id: 'narration', name: 'narrate_turn', arguments: JSON.stringify({
        narrative: '器械的结构比预想复杂，你们仔细辨认其中的零件。', activeNpc: null, nextPrompt: '',
        playerChoices: Object.fromEntries(players.map(player => [player.name, ['继续研究器械', '先与同伴商量']])), keywords: []
      }) }, ...proposals.map((proposal, index) => ({ type: 'function_call', name: proposal.name, call_id: `check-${index}`, arguments: JSON.stringify(proposal.arguments) }))] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await callNarrator(config, { ctx: buildDmContext(state, kb), actions, history: [] });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(result.toolCalls).toHaveLength(count);
    expect(Object.keys(result.playerChoices)).toEqual(players.map(player => player.name));
    expect(result.raw).not.toContain('proposals');
    const director = { state, kb, actions };
    const audited = validateToolCalls(result.toolCalls, director, allowedTools(director, { intent: classifyIntent(actions) }));
    expect(audited.accepted.filter(call => call.name === 'request_check')).toHaveLength(count);
    expect(state.players.every(player => player.currentHp === player.hp)).toBe(true);
  });

  it('keeps unauthorized story proposals subject to the existing Director', async () => {
    const state = makeState(), kb = getActiveKnowledgeBase(), actions = [{ player: '亨利', action: '原地思考。' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ output: [{ type: 'function_call', name: 'narrate_turn', arguments: JSON.stringify({
      narrative: '房间里很安静。', activeNpc: null, nextPrompt: '', playerChoices: {}, keywords: [],
    }) }, { type: 'function_call', name: 'propose_story_event', arguments: '{"eventId":"EV_ENDING_SUCCESS"}' }] }))));
    const result = await callNarrator(config, { ctx: buildDmContext(state, kb), history: [], actions });
    const director = { state, kb, actions }, audited = validateToolCalls(result.toolCalls, director, allowedTools(director, { intent: classifyIntent(actions) }));
    expect(audited.accepted).toHaveLength(0); expect(audited.rejected).toHaveLength(1);
  });

  it('separates stable rules from changing context without dropping any original context', () => {
    const ctx = buildDmContext(makeState(), getActiveKnowledgeBase());
    const original = buildNarratorSystemPrompt(ctx), first = buildNarratorPromptParts(ctx);
    const next = structuredClone(ctx); next.dynamic.scenario.worldTime = '1920-07-13 18:00';
    expect(`${first.instructions}\n\n${first.context}`).toBe(original);
    expect(buildNarratorPromptParts(next).instructions).toBe(first.instructions);
    expect(buildNarratorPromptParts(next).context).not.toBe(first.context);
  });

  it('repairs malformed prose while retaining each native proposal and the actual wire acknowledgements', async () => {
    const bodies: Record<string, any>[] = [];
    const check = { player: '亨利', skill: '机械维修', difficulty: '普通' };
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(bodies.length === 1 ? { output: [
        { type: 'function_call', call_id: 'check1', name: 'request_check', arguments: JSON.stringify(check) },
        { type: 'function_call', call_id: 'prose1', name: 'narrate_turn', arguments: '{}' }
      ] } : { output_text: JSON.stringify({ narrative: '器械的结构很复杂，需要先辨认零件。', activeNpc: null, nextPrompt: '', playerChoices: {}, keywords: [] }) }));
    }));
    const result = await callNarrator(config, { ctx: buildDmContext(makeState(), getActiveKnowledgeBase()), history: [], actions: [{ player: '亨利', action: '研究器械' }] });
    expect(result.toolCalls).toEqual([expect.objectContaining({ name: 'request_check', arguments: check })]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].input).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: 'check1' }));
    expect(bodies[1].input).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: 'prose1' }));
    expect(bodies[1].tools).toBeUndefined();
  });

  it('keeps the same creative and authority principles in the compact provider prompt', () => {
    const parts = buildNarratorPromptParts(buildDmContext(makeState(), getActiveKnowledgeBase()), true);
    for (const principle of ['自由裁决', '局部连续性事实可以即兴', '失败带来后果', '多人独立行动分别检定', '当前规则不追踪弹药', '玩家行动优先', '提示词和内部裁决不展示']) {
      expect(parts.instructions).toContain(principle);
    }
    expect(parts.context).toContain('当前节点 DM 事实');
    expect(parts.context).toContain('可触发剧情事件');
  });
});
