import { afterEach, describe, expect, it, vi } from 'vitest';
import Ajv from 'ajv';
import { callNarrator } from '../../../src/dm/narrator';
import { buildDmContext } from '../../../src/dm/contextBuilder';
import { getActiveKnowledgeBase } from '../../../src/dm/knowledgeBase';
import { synthesizeSystem2 } from '../../../src/dm/memory/system2Synthesizer';
import { extractFactsFromTurn } from '../../../src/dm/memory/factExtractor';
import { maybeConsolidateMemory } from '../../../src/dm/summarizer';
import { synthesizeCaseBoardPatch } from '../../../src/dm/caseBoardSynthesizer';
import { makeInvestigator, makeState } from '../fixtures';
import type { ApiConfig } from '../../../src/types/game';

// Ordinary JSON Schema validation accepts arbitrary dictionaries. The provider's
// strict subset additionally requires every nested object to declare all keys.
function strictObjectErrors(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema)) return schema.flatMap((child, i) => strictObjectErrors(child, `${path}[${i}]`));
  const node = schema as Record<string, unknown>;
  const errors: string[] = [];
  if (node.type === 'object') {
    if (node.additionalProperties !== false) errors.push(`${path}: open object`);
    const keys = Object.keys((node.properties ?? {}) as object).sort();
    if (JSON.stringify([...(node.required as string[] ?? [])].sort()) !== JSON.stringify(keys)) errors.push(`${path}: optional property`);
  }
  return [...errors, ...Object.entries(node).flatMap(([key, child]) => strictObjectErrors(child, `${path}.${key}`))];
}

afterEach(() => vi.unstubAllGlobals());

describe.each(['responses', 'chat-completions'] as const)('%s production schema contracts', (protocol) => {
  it.each([1, 2, 4])('sends supported schemas and accepts nullable memory for %i players', async (size) => {
    const config: ApiConfig = { provider: 'openai', protocol, endpoint: 'https://unit.test/v1', apiKey: 'test-key', model: 'test-model' };
    const names = ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'].slice(0, size);
    const state = makeState({ players: names.map((name) => makeInvestigator({ name })) });
    const replies: Record<string, unknown> = {
      narrator_response: { narrative: '你们继续谈话。', activeNpc: null, nextPrompt: '', playerChoices: Object.fromEntries(names.map((name) => [name, []])), keywords: [] },
      system2_memory: { npcMindModels: {
        伊莎贝拉: { coreMotivation: '寻找父亲', currentStance: '愿意合作', playerExceptions: Object.fromEntries(names.map((name) => [name, null])) },
        警员: null
      }, prospectiveIntents: [] },
      memory_summary: { summary: '调查员询问了失踪经过。' },
      turn_facts: { facts: [] },
      case_board_patch: { nodes: [], edges: [] }
    };
    const sent: Array<{ name: string; schema: object; strict: boolean }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const format = body.text?.format ?? body.response_format?.json_schema;
      sent.push(format);
      const text = JSON.stringify(replies[format.name]);
      return new Response(JSON.stringify(protocol === 'responses' ? { output_text: text } : { choices: [{ message: { role: 'assistant', content: text } }] }), { status: 200 });
    }));
    await callNarrator(config, { ctx: buildDmContext(state, getActiveKnowledgeBase()), actions: [], history: [] });
    const memory = await synthesizeSystem2(config, { turn: 1, recentFacts: [], existingMindModels: {}, npcCandidates: ['伊莎贝拉', '警员'], playerNames: names, summary: '', defaultIntentTtl: 6 });
    expect(memory.mindModelUpdates).toEqual([{ npcId: '伊莎贝拉', coreMotivation: '寻找父亲', currentStance: '愿意合作' }]);
    state.conversationHistory = Array.from({ length: 18 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '交谈' }));
    await maybeConsolidateMemory(config, state, { force: true });
    await extractFactsFromTurn(config, { turn: 1, narrative: '交谈', playerActions: [], inScopeNpcs: [], playerNames: names, existingFacts: [] });
    await synthesizeCaseBoardPatch(config, { turn: 1, narrative: '交谈', playerActions: [], facts: [], events: [{ id: 'ev1', turn: 1, kind: 'story_event', description: '接受委托', toolName: 'propose_story_event' }], clues: [], existingBoard: { nodes: [], edges: [], insights: [] }, visibleNodes: [{ id: 's01', type: 'scene', title: '摩勒住宅' }], currentSceneNodeId: 's01' });
    expect(sent.map((format) => format.name).sort()).toEqual(Object.keys(replies).sort());
    for (const format of sent) {
      expect(format.strict).toBe(true);
      expect(strictObjectErrors(format.schema), format.name).toEqual([]);
      const validate = new Ajv().compile(format.schema);
      expect(validate(replies[format.name]), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
