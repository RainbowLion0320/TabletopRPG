import { storyData } from '../data/storyData';
import type {
  CaseBoardDefinition,
  CaseBoardEdge,
  CaseBoardNode,
  CaseBoardRevealCondition,
  CaseBoardRevealRule,
  GameState,
  SceneId
} from '../types/game';
import { deriveRevealContext } from './knowledgeBase';
import { evaluateScenarioCondition, getScenarioProgressForState } from '../scenario/engine';

export interface VisibleCaseBoard {
  nodes: CaseBoardNode[];
  edges: CaseBoardEdge[];
}

function collectFoundItemIds(state: GameState): Set<string> {
  return new Set(state.clues.map((clue) => clue.id));
}

function collectVisitedScenes(state: GameState): Set<SceneId> {
  return new Set(deriveRevealContext(state).visitedScenes);
}

export function collectKnownNpcNames(state: GameState): string[] {
  const known = new Set<string>();
  const add = (name: string | null | undefined) => {
    if (name && storyData.npcs[name]) known.add(name);
  };

  add(state.activeNpcName);
  for (const sceneId of deriveRevealContext(state).visitedScenes) {
    storyData.scenes[sceneId]?.npcs.forEach(add);
  }
  Object.keys(state.npcMindModels ?? {}).forEach(add);
  for (const fact of state.atomicFacts ?? []) {
    add(fact.actor);
    add(fact.target);
  }
  return Array.from(known);
}

function conditionMatches(
  condition: CaseBoardRevealCondition,
  state: GameState,
  foundItems: Set<string>,
  knownNpcs: Set<string>,
  visitedScenes: Set<SceneId>
): boolean {
  if (condition.itemFound && !foundItems.has(condition.itemFound)) return false;
  if (condition.npcKnown && !knownNpcs.has(condition.npcKnown)) return false;
  if (condition.sceneVisited && !visitedScenes.has(condition.sceneVisited)) return false;
  if (condition.flag && !state.flags[condition.flag]) return false;
  return true;
}

function revealRuleMatches(
  rule: CaseBoardRevealRule,
  state: GameState,
  foundItems: Set<string>,
  knownNpcs: Set<string>,
  visitedScenes: Set<SceneId>
): boolean {
  if ('anyOf' in rule) {
    return rule.anyOf.some((condition) =>
      conditionMatches(condition, state, foundItems, knownNpcs, visitedScenes)
    );
  }
  return conditionMatches(rule, state, foundItems, knownNpcs, visitedScenes);
}

export function getVisibleCaseBoard(
  definition: CaseBoardDefinition,
  state: GameState
): VisibleCaseBoard {
  const foundItems = collectFoundItemIds(state);
  const knownNpcs = new Set(collectKnownNpcNames(state));
  const visitedScenes = collectVisitedScenes(state);
  const scenarioProgress = getScenarioProgressForState(state);
  const nodes = definition.nodes.filter((node) =>
    node.scenarioCondition
      ? evaluateScenarioCondition(node.scenarioCondition, scenarioProgress, state.currentScene)
        || revealRuleMatches(node.revealWhen, state, foundItems, knownNpcs, visitedScenes)
      : revealRuleMatches(node.revealWhen, state, foundItems, knownNpcs, visitedScenes)
  );
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = definition.edges.filter((edge) => {
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return false;
    if (edge.scenarioCondition
      && !evaluateScenarioCondition(edge.scenarioCondition, scenarioProgress, state.currentScene)) return false;
    if (edge.revealWhen === 'bothNodesVisible') return true;
    return revealRuleMatches(edge.revealWhen, state, foundItems, knownNpcs, visitedScenes);
  });
  return { nodes, edges };
}
