import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesizeCaseBoardPatch } from '../../src/dm/caseBoardSynthesizer';
import type { ApiConfig, AtomicFact, PersistedDMEvent } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai', protocol: 'responses', apiKey: 'unit-test-key', model: 'unit-test-model', endpoint: 'https://unit.test/v1'
};

function response(body: unknown): Response {
  return new Response(JSON.stringify({ output_text: JSON.stringify(body) }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

function narrativeEvent(description: string): PersistedDMEvent {
  return { id: 'evt-1-narr', turn: 1, kind: 'narrative', description };
}

function storyEvent(description: string): PersistedDMEvent {
  return { id: 'evt-1-story', turn: 1, kind: 'story_event', description, toolName: 'propose_story_event' };
}

function fact(value: string): AtomicFact {
  return { id: 'f_1_0', turn: 1, actor: '伊莎贝拉·摩勒', predicate: 'knowledge', value, source: 'system1' };
}

function input(overrides: Partial<Parameters<typeof synthesizeCaseBoardPatch>[1]> = {}) {
  const event = narrativeEvent('门廊留下了新鲜拖拽刮痕');
  return {
    turn: 1,
    narrative: event.description,
    playerActions: [{ player: '亨利', action: '检查门廊' }],
    facts: [],
    newFacts: [],
    events: [event],
    clues: [],
    newClueIds: [],
    existingBoard: { nodes: [], edges: [], insights: [] },
    visibleNodes: [
      { id: 'scene-s01', type: 'scene' as const, title: '摩勒住宅' },
      { id: 'npc-isabella', type: 'npc' as const, title: '伊莎贝拉·摩勒' }
    ],
    currentSceneNodeId: 'scene-s01',
    ...overrides
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('caseBoardSynthesizer v7', () => {
  it('does not promote an entity atomic fact into a standalone card', async () => {
    const newFact = fact('回避父亲债务');
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));
    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative: '伊莎贝拉沉默片刻。',
      events: [narrativeEvent('伊莎贝拉沉默片刻。')],
      facts: [newFact], newFacts: [newFact]
    }));
    expect(patch).toEqual({ nodes: [], edges: [], insights: [] });
  });

  it('creates a connected event fallback from an authored story event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));
    const patch = await synthesizeCaseBoardPatch(config, input({
      events: [narrativeEvent('门廊留下了新鲜拖拽刮痕'), storyEvent('作者事件确认门廊刮痕')]
    }));
    expect(patch.nodes).toEqual([expect.objectContaining({ type: 'event', title: '门廊的新鲜拖拽刮痕' })]);
    expect(patch.edges).toEqual([expect.objectContaining({ from: 'scene-s01', to: patch.nodes[0].id })]);
  });

  it('uses a compact evidence title instead of turning a sentence into a button', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));
    const narrative = '亨利注意到门缝处有新鲜的脚印痕迹，说明最近有人出入。';
    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative,
      events: [narrativeEvent(narrative), storyEvent('作者事件确认脚印')]
    }));

    expect(patch.nodes[0]).toMatchObject({
      title: '门缝的新鲜脚印痕迹',
      detail: '亨利注意到门缝处有新鲜的脚印痕迹，说明最近有人出入'
    });
  });

  it('does not create noise from a generic continuation turn', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const narrative = '调查继续进行，众人等待下一步行动。';
    const patch = await synthesizeCaseBoardPatch(config, input({ narrative, events: [narrativeEvent(narrative)] }));
    expect(patch).toEqual({ nodes: [], edges: [], insights: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not turn a negated mention into a key discovery without authoritative increment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const narrative = '伊莎贝拉说信件和报纸没有缺失或异常，也无法确认新的访客信息。';
    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative,
      playerActions: [{ player: '艾达', action: '不查看私人信件，只询问收信流程。' }],
      events: [narrativeEvent(narrative)]
    }));

    expect(patch).toEqual({ nodes: [], edges: [], insights: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not turn a failed check narration into confirmed evidence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative: '门廊似乎留下了拖拽刮痕，但亨利没能确认。',
      playerActions: [{ player: '亨利', action: '【检定结果】侦查结果：失败。' }]
    }));
    expect(patch).toEqual({ nodes: [], edges: [], insights: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops invented source ids and falls back to the authored story event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      nodes: [{
        id: 'ai-invented', semanticKey: 'theory:invented', type: 'theory', title: '不存在来源的推测', subtitle: '', detail: '',
        importance: 5, source: 'ai', certainty: 'hypothesis', sourceFactIds: ['fake'], sourceEventIds: [], sourceClueIds: [],
        createdTurn: 1, updatedTurn: 1, status: 'active'
      }],
      edges: []
    })));
    const patch = await synthesizeCaseBoardPatch(config, input({
      events: [narrativeEvent('门廊留下了新鲜拖拽刮痕'), storyEvent('作者事件确认门廊刮痕')]
    }));
    expect(patch.nodes[0]).toMatchObject({ type: 'event', sourceEventIds: ['evt-1-story'] });
  });

  it('accepts a theory only when it connects two visible anchors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      nodes: [{
        id: 'ai-theory', semanticKey: 'theory:isabella-house', type: 'theory', title: '伊莎贝拉隐瞒住宅内的活动',
        subtitle: '待验证', detail: '她的证词与现场不一致', importance: 4, source: 'ai', certainty: 'hypothesis',
        sourceFactIds: [], sourceEventIds: ['evt-1-story'], sourceClueIds: [], createdTurn: 1, updatedTurn: 1, status: 'active'
      }],
      edges: [
        {
          id: 'edge-1', relationKey: 'scene-theory', from: 'scene-s01', to: 'ai-theory', label: '现场矛盾', tone: 'suspicion',
          source: 'ai', certainty: 'hypothesis', sourceFactIds: [], sourceEventIds: ['evt-1-story'], sourceClueIds: [],
          createdTurn: 1, updatedTurn: 1, status: 'active'
        },
        {
          id: 'edge-2', relationKey: 'isabella-theory', from: 'npc-isabella', to: 'ai-theory', label: '证词矛盾', tone: 'suspicion',
          source: 'ai', certainty: 'hypothesis', sourceFactIds: [], sourceEventIds: ['evt-1-story'], sourceClueIds: [],
          createdTurn: 1, updatedTurn: 1, status: 'active'
        }
      ]
    })));
    const patch = await synthesizeCaseBoardPatch(config, input({
      events: [narrativeEvent('门廊留下了新鲜拖拽刮痕'), storyEvent('作者事件确认门廊刮痕')]
    }));
    expect(patch.nodes).toHaveLength(1);
    expect(patch.edges).toHaveLength(2);
  });
});
