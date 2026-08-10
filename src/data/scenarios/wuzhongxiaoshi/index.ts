/** AUTO-GENERATED scenario compatibility projection. YAML remains canonical. */
import type { CaseBoardDefinition, SceneId } from '../../../types/game';
import type { KnowledgeBase, ScenarioRule } from '../../../dm/types';
import {
  generatedScenarioModule,
  scenarioAssetUrls,
  scenarioContentHash
} from './runtime.generated';

export const scenarioRuntimeDefinition = {
  ...generatedScenarioModule,
  contentHash: scenarioContentHash,
  assetUrls: scenarioAssetUrls
};

const npcNameById = new Map(generatedScenarioModule.world.npcs.map((npc) => [npc.id, npc.name]));

export const scenes: KnowledgeBase['scenes'] = Object.fromEntries(
  generatedScenarioModule.world.scenes.map((scene) => [scene.id, {
    public: {
      id: scene.id,
      name: scene.name,
      chapterTitle: scene.chapterTitle,
      desc: scene.description,
      image: scenarioAssetUrls[scene.assetId],
      npcs: scene.npcIds.map((id) => npcNameById.get(id)).filter((name): name is string => Boolean(name)),
      items: [...scene.itemIds],
      aliases: [...scene.aliases]
    },
    secretIds: [...(scene.dmFactIds ?? [])]
  }])
) as KnowledgeBase['scenes'];

export const npcs: KnowledgeBase['npcs'] = Object.fromEntries(
  generatedScenarioModule.world.npcs.map((npc) => [npc.name, {
    public: {
      name: npc.name,
      role: npc.role,
      attitude: npc.attitude,
      appearance: npc.appearance,
      hp: npc.hp,
      portrait: npc.assetId ? scenarioAssetUrls[npc.assetId] : undefined,
      aliases: [...npc.aliases]
    },
    secretIds: [...npc.dmFactIds]
  }])
);

export const items: KnowledgeBase['items'] = Object.fromEntries(
  generatedScenarioModule.world.items.map((item) => [item.id, {
    public: {
      id: item.id,
      name: item.name,
      scene: item.sceneId,
      appearance: item.appearance,
      aliases: [...item.aliases]
    },
    secretIds: [...item.factIds]
  }])
);

export const secrets: KnowledgeBase['secrets'] = Object.fromEntries(
  generatedScenarioModule.world.facts.map((fact) => [fact.id, {
    id: fact.id,
    content: fact.statement,
    revealOn: [
      ...generatedScenarioModule.world.items
        .filter((item) => item.factIds.includes(fact.id))
        .map((item) => ({ type: 'itemFound' as const, itemId: item.id })),
      ...(fact.id === 'F02' ? [{ type: 'flag' as const, key: 'met_montreal' }] : [])
    ]
  }])
);

export const rules: ScenarioRule[] = generatedScenarioModule.rules.entries.map((rule) => ({
  id: rule.id,
  trigger: rule.trigger === 'sceneEnter' ? 'sceneEnter' : rule.trigger === 'checkRequested' ? 'preCheck' : 'postAction',
  description: rule.description
}));

export const sceneGraph = Object.fromEntries(
  generatedScenarioModule.world.scenes.map((scene) => [scene.id, scene.exits.map((exit) => exit.to)])
) as Record<SceneId, SceneId[]>;

export const caseBoard: CaseBoardDefinition = {
  summary: generatedScenarioModule.presentation.caseBoard.summary,
  nodes: generatedScenarioModule.presentation.caseBoard.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    refId: node.type === 'npc' ? npcNameById.get(node.refId) ?? node.refId : node.refId,
    title: node.title,
    subtitle: node.subtitle,
    importance: node.importance as 1 | 2 | 3 | 4 | 5,
    revealWhen: node.type === 'scene'
      ? { sceneVisited: node.refId }
      : node.type === 'npc'
        ? { npcKnown: npcNameById.get(node.refId) ?? node.refId }
        : node.type === 'item'
          ? { itemFound: node.refId }
          : { flag: '__scenario_condition_only__' },
    scenarioCondition: node.when
  })),
  edges: generatedScenarioModule.presentation.caseBoard.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    tone: edge.tone,
    revealWhen: 'bothNodesVisible',
    scenarioCondition: edge.when
  }))
};

export const wuzhongxiaoshi: KnowledgeBase = {
  scenarioId: generatedScenarioModule.manifest.id,
  title: generatedScenarioModule.manifest.title,
  era: generatedScenarioModule.manifest.era,
  scenes,
  npcs,
  items,
  secrets,
  rules,
  sceneGraph
};
