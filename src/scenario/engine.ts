import type { Condition, Effect, StoryEvent } from './generated/scenario-schema';
import type {
  CheckRequest,
  DiceResult,
  ScenarioClueStatus,
  ScenarioEncounterState,
  ScenarioProgress,
  ScenarioStepStatus,
  SceneId
} from '../types/game';
import {
  generatedScenarioModule as scenario,
  scenarioContentHash
} from '../data/scenarios/wuzhongxiaoshi/runtime.generated';
import { countCompletedGameTurns } from '../services/turns';

export interface ScenarioEffectDelta {
  field: 'hp' | 'san' | 'money' | 'mythos';
  target: 'actor' | 'party';
  value: number;
}

export interface ScenarioTransitionResult {
  progress: ScenarioProgress;
  firedEventIds: string[];
  narrativeCues: string[];
  deltas: ScenarioEffectDelta[];
  requestedCheck: CheckRequest | null;
  softPrompt: string | null;
}

export interface ProcessScenarioTurnOptions {
  currentScene: SceneId;
  previousScene?: SceneId;
  storyEventIds?: string[];
  turn: number;
  completeTurn: boolean;
  actorName?: string;
  checkResult?: { id: string; outcome: DiceResult['level'] };
  random?: () => number;
}

export class ScenarioContentMismatchError extends Error {}

const beatsById = new Map(scenario.progression.beats.map((item) => [item.id, item]));
const objectivesById = new Map(scenario.progression.objectives.map((item) => [item.id, item]));
const eventsById = new Map(scenario.progression.storyEvents.map((item) => [item.id, item]));
const scenesById = new Map(scenario.world.scenes.map((item) => [item.id, item]));
const encountersById = new Map(scenario.world.encounters.map((item) => [item.id, item]));
const recoveryEventIds = new Set(
  scenario.progression.beats.map((beat) => beat.recoveryEventId).filter(Boolean)
);
const declaredVariables = new Set(scenario.progression.variables.map((item) => item.id));
const variableTypes = new Map(scenario.progression.variables.map((item) => [item.id, item.type]));
const actIds = new Set(scenario.progression.acts.map((item) => item.id));
const beatIds = new Set(scenario.progression.beats.map((item) => item.id));
const objectiveIds = new Set(scenario.progression.objectives.map((item) => item.id));
const factIds = new Set(scenario.world.facts.map((item) => item.id));
const clueIds = new Set(scenario.world.items.map((item) => item.id));
const sceneIds = new Set(scenario.world.scenes.map((item) => item.id));
const eventIds = new Set(scenario.progression.storyEvents.map((item) => item.id));
const endingIds = new Set(scenario.progression.endings.map((item) => item.id));
const encounterIds = new Set(scenario.world.encounters.map((item) => item.id));
const allEffects = [
  ...scenario.progression.storyEvents.flatMap((item) => item.effects),
  ...scenario.progression.endings.flatMap((item) => item.effects),
  ...scenario.rules.entries.flatMap((item) => item.effects)
];
const clockIds = new Set(allEffects.flatMap((effect) => {
  if ('startClock' in effect) return [effect.startClock];
  if ('tickClock' in effect) return [effect.tickClock];
  if ('stopClock' in effect) return [effect.stopClock];
  return [];
}));
const checkIds = new Set(allEffects.flatMap((effect) =>
  'requestCheck' in effect ? [effect.requestCheck] : []
));
const previousContentVersions = new Set([
  '1.0.0#75b8bb187c4dace1',
  '1.0.1#cf984fba4d854a2b',
  '1.1.0#2f9f28cd2a887698',
  '1.1.0#9aa4d2e09756fc0a',
  '1.1.1#df77e2dcefd534f1',
  '1.1.2#f6d2725f8d274d21',
  '1.1.3#a65a4b4b398d405d',
  '1.1.4#a30bd9e43e729d45',
  '1.1.5#4d651496e9200891',
  '1.1.5#33991bac69fb658b',
  '1.1.5#7a9fe3252f30b83f',
  '1.1.6#6204fadbf9c5cf3f'
]);
const autoMapContentVersions = new Set([
  '1.1.5#4d651496e9200891',
  '1.1.5#33991bac69fb658b',
  '1.1.5#7a9fe3252f30b83f'
]);

function statusRecord(ids: string[], activeId?: string): Record<string, ScenarioStepStatus> {
  return Object.fromEntries(ids.map((id) => [id, id === activeId ? 'active' : 'locked']));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compare(left: string | number | boolean, op: string, right: string | number | boolean): boolean {
  switch (op) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
    default: return false;
  }
}

function compareTime(left: string, op: string, right: string): boolean {
  const leftMs = parseWorldTime(left);
  const rightMs = parseWorldTime(right);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return false;
  return compare(leftMs, op, rightMs);
}

function parseWorldTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

export function evaluateScenarioCondition(
  condition: Condition,
  progress: ScenarioProgress,
  currentScene: SceneId
): boolean {
  if ('all' in condition) return condition.all.every((item) => evaluateScenarioCondition(item, progress, currentScene));
  if ('any' in condition) return condition.any.some((item) => evaluateScenarioCondition(item, progress, currentScene));
  if ('not' in condition) return !evaluateScenarioCondition(condition.not, progress, currentScene);
  if ('always' in condition) return condition.always;
  if ('sceneIs' in condition) return currentScene === condition.sceneIs;
  if ('sceneVisited' in condition) return progress.visitedSceneIds.includes(condition.sceneVisited);
  if ('beat' in condition) return progress.beatStates[condition.beat] === condition.status;
  if ('objective' in condition) return progress.objectiveStates[condition.objective] === condition.status;
  if ('clue' in condition) return (progress.clueStates[condition.clue] ?? 'unknown') === condition.status;
  if ('factKnown' in condition) return progress.knownFactIds.includes(condition.factKnown);
  if ('eventFired' in condition) return progress.firedEventIds.includes(condition.eventFired);
  if ('variable' in condition) return compare(progress.variables[condition.variable], condition.op, condition.value);
  if ('worldTime' in condition) return compareTime(progress.worldTime, condition.op, condition.value);
  if ('clock' in condition) return compare(progress.clocks[condition.clock]?.value ?? 0, condition.op, condition.value);
  if ('check' in condition) {
    const actual = progress.lastCheckOutcomes[condition.check];
    if (condition.outcome === 'success') return actual === 'crit' || actual === 'hard' || actual === 'success';
    return actual === condition.outcome;
  }
  if ('encounter' in condition) {
    const encounter = progress.encounters[condition.encounter];
    if ('field' in condition) {
      return compare(encounter?.[condition.field] ?? 0, condition.op, condition.value);
    }
    return (encounter?.state ?? 'inactive') === condition.state;
  }
  return false;
}

export function createScenarioProgress(): ScenarioProgress {
  const startBeat = beatsById.get(scenario.manifest.startBeatId);
  const encounters = Object.fromEntries(scenario.world.encounters.map((item) => [
    item.id,
    {
      state: 'inactive',
      round: 0,
      defeated: 0,
      opponentHp: item.count * item.hpEach
    } satisfies ScenarioEncounterState
  ]));
  return {
    moduleId: scenario.manifest.id,
    moduleVersion: scenario.manifest.contentVersion,
    contentHash: scenarioContentHash,
    worldTime: scenario.manifest.startTime,
    activeActId: startBeat?.actId ?? scenario.progression.acts[0]?.id ?? '',
    beatStates: statusRecord(scenario.progression.beats.map((item) => item.id), scenario.manifest.startBeatId),
    objectiveStates: statusRecord(
      scenario.progression.objectives.map((item) => item.id),
      startBeat?.objectiveIds[0]
    ),
    knownFactIds: [],
    clueStates: Object.fromEntries(scenario.world.items.map((item) => [item.id, 'unknown'])),
    firedEventIds: [],
    settledEndingIds: [],
    variables: Object.fromEntries(scenario.progression.variables.map((item) => [item.id, item.default])),
    clocks: {},
    encounters,
    lastCheckOutcomes: {},
    visitedSceneIds: [scenario.manifest.startSceneId],
    lastProgressTurn: 0,
    idleTurns: 0,
    endingId: null,
    migrationLog: []
  };
}

function cloneProgress(progress: ScenarioProgress): ScenarioProgress {
  return {
    ...progress,
    beatStates: { ...progress.beatStates },
    objectiveStates: { ...progress.objectiveStates },
    knownFactIds: [...progress.knownFactIds],
    clueStates: { ...progress.clueStates },
    firedEventIds: [...progress.firedEventIds],
    settledEndingIds: [...progress.settledEndingIds],
    variables: { ...progress.variables },
    clocks: Object.fromEntries(Object.entries(progress.clocks).map(([id, value]) => [id, { ...value }])),
    encounters: Object.fromEntries(Object.entries(progress.encounters).map(([id, value]) => [id, { ...value }])),
    lastCheckOutcomes: { ...progress.lastCheckOutcomes },
    visitedSceneIds: [...progress.visitedSceneIds],
    migrationLog: [...progress.migrationLog]
  };
}

function advanceTime(progress: ScenarioProgress, minutes: number): void {
  const parsed = parseWorldTime(progress.worldTime);
  if (!Number.isFinite(parsed)) return;
  const next = new Date(parsed + minutes * 60_000);
  progress.worldTime = next.toISOString().slice(0, 16);
}

function rollExpression(value: number | string, random: () => number): number {
  if (typeof value === 'number') return value;
  const match = /^(-?)(\d+)d(\d+)([+-]\d+)?$/i.exec(value.trim());
  if (!match) return Number(value) || 0;
  const sign = match[1] === '-' ? -1 : 1;
  const count = Math.max(1, Number(match[2]));
  const sides = Math.max(1, Number(match[3]));
  let total = Number(match[4] ?? 0);
  for (let index = 0; index < count; index += 1) total += Math.floor(random() * sides) + 1;
  return sign * total;
}

function setStepStatus(
  record: Record<string, ScenarioStepStatus>,
  id: string,
  status: ScenarioStepStatus
): void {
  if (id in record) record[id] = status;
}

function activateBeat(progress: ScenarioProgress, beatId: string): void {
  const beat = beatsById.get(beatId);
  if (!beat) return;
  if (progress.beatStates[beatId] === 'locked') progress.beatStates[beatId] = 'active';
  const objectiveIds = beat.kind === 'finale'
    ? beat.objectiveIds.filter((id) => objectivesById.get(id)?.required)
    : beat.objectiveIds;
  for (const objectiveId of objectiveIds) {
    if (progress.objectiveStates[objectiveId] === 'locked') {
      progress.objectiveStates[objectiveId] = 'active';
    }
  }
}

function settleBeat(
  progress: ScenarioProgress,
  beatId: string,
  status: Extract<ScenarioStepStatus, 'completed' | 'failed'>
): void {
  const beat = beatsById.get(beatId);
  if (!beat) return;
  progress.beatStates[beatId] = status;
  for (const objectiveId of beat.objectiveIds) {
    if (!objectivesById.get(objectiveId)?.required) continue;
    const objectiveStatus = progress.objectiveStates[objectiveId];
    if (objectiveStatus === 'locked' || objectiveStatus === 'active') {
      progress.objectiveStates[objectiveId] = status;
    }
  }
}

function applyEffect(
  progress: ScenarioProgress,
  effect: Effect,
  result: ScenarioTransitionResult,
  actorName: string | undefined,
  random: () => number
): void {
  if ('activateBeat' in effect) activateBeat(progress, effect.activateBeat);
  else if ('completeBeat' in effect) settleBeat(progress, effect.completeBeat, 'completed');
  else if ('failBeat' in effect) settleBeat(progress, effect.failBeat, 'failed');
  else if ('activateObjective' in effect) setStepStatus(progress.objectiveStates, effect.activateObjective, 'active');
  else if ('completeObjective' in effect) setStepStatus(progress.objectiveStates, effect.completeObjective, 'completed');
  else if ('failObjective' in effect) setStepStatus(progress.objectiveStates, effect.failObjective, 'failed');
  else if ('revealFact' in effect) progress.knownFactIds = unique([...progress.knownFactIds, effect.revealFact]);
  else if ('discoverClue' in effect) progress.clueStates[effect.discoverClue] = 'discovered';
  else if ('analyzeClue' in effect) progress.clueStates[effect.analyzeClue] = 'analyzed';
  else if ('destroyClue' in effect) progress.clueStates[effect.destroyClue] = 'destroyed';
  else if ('setVariable' in effect && declaredVariables.has(effect.setVariable)) progress.variables[effect.setVariable] = effect.value;
  else if ('advanceTime' in effect) advanceTime(progress, effect.advanceTime);
  else if ('startClock' in effect) progress.clocks[effect.startClock] = { value: effect.value, active: true, visible: effect.visible ?? false };
  else if ('tickClock' in effect) {
    const clock = progress.clocks[effect.tickClock];
    if (clock?.active) clock.value += effect.amount;
  } else if ('stopClock' in effect) {
    const clock = progress.clocks[effect.stopClock];
    if (clock) clock.active = false;
  } else if ('requestCheck' in effect && !result.requestedCheck) {
    result.requestedCheck = {
      scenarioCheckId: effect.requestCheck,
      skill: effect.skill,
      difficulty: effect.difficulty,
      player: effect.player ?? actorName ?? '',
      reason: effect.reason
    };
  } else if ('applyDelta' in effect) {
    result.deltas.push({
      field: effect.applyDelta,
      target: effect.target,
      value: rollExpression(effect.value, random)
    });
  } else if ('startEncounter' in effect) {
    const definition = encountersById.get(effect.startEncounter);
    const existing = progress.encounters[effect.startEncounter];
    if (definition && existing) {
      progress.encounters[effect.startEncounter] = {
        ...existing,
        state: 'active',
        route: effect.route,
        round: 0,
        defeated: 0,
        opponentHp: definition.count * definition.hpEach
      };
    }
  } else if ('updateEncounter' in effect) {
    const encounter = progress.encounters[effect.updateEncounter];
    if (encounter) encounter[effect.field] = Math.max(0, encounter[effect.field] + effect.amount);
  } else if ('resolveEncounter' in effect) {
    const encounter = progress.encounters[effect.resolveEncounter];
    if (encounter) encounter.state = effect.state;
  } else if ('setEnding' in effect) progress.endingId = effect.setEnding;
}

function updateStructuralStates(progress: ScenarioProgress, currentScene: SceneId): void {
  for (let pass = 0; pass < scenario.progression.beats.length + 1; pass += 1) {
    let changed = false;
    for (const beat of scenario.progression.beats) {
      if (progress.beatStates[beat.id] === 'locked' && evaluateScenarioCondition(beat.activation, progress, currentScene)) {
        activateBeat(progress, beat.id);
        changed = true;
      }
      if (progress.beatStates[beat.id] === 'active' && evaluateScenarioCondition(beat.completion, progress, currentScene)) {
        settleBeat(progress, beat.id, 'completed');
        changed = true;
      }
    }
    if (!changed) break;
  }
  const activeBeat = scenario.progression.beats
    .filter((beat) => progress.beatStates[beat.id] === 'active')
    .sort((left, right) => {
      const leftOrder = scenario.progression.acts.find((act) => act.id === left.actId)?.order ?? 0;
      const rightOrder = scenario.progression.acts.find((act) => act.id === right.actId)?.order ?? 0;
      return rightOrder - leftOrder;
    })[0];
  if (activeBeat) progress.activeActId = activeBeat.actId;
}

function eventIsAllowed(event: StoryEvent, progress: ScenarioProgress, currentScene: SceneId): boolean {
  const beat = beatsById.get(event.beatId);
  const beatStatus = progress.beatStates[event.beatId];
  const canSettleAfterBeat = beatStatus === 'completed'
    && ((event.trigger === 'manual') || (event.trigger === 'automatic' && event.once));
  if (!beat || (beatStatus !== 'active' && !canSettleAfterBeat)) return false;
  if (!beat.allowedEventIds.includes(event.id)) return false;
  if (event.once && progress.firedEventIds.includes(event.id)) return false;
  return evaluateScenarioCondition(event.when, progress, currentScene);
}

function conditionReferencesCheck(condition: Condition, checkId: string): boolean {
  if ('all' in condition) return condition.all.some((item) => conditionReferencesCheck(item, checkId));
  if ('any' in condition) return condition.any.some((item) => conditionReferencesCheck(item, checkId));
  if ('not' in condition) return conditionReferencesCheck(condition.not, checkId);
  return 'check' in condition && condition.check === checkId;
}

function fireEvent(
  event: StoryEvent,
  result: ScenarioTransitionResult,
  options: ProcessScenarioTurnOptions,
  eligibilityAlreadyChecked = false
): boolean {
  const progress = result.progress;
  if (!eligibilityAlreadyChecked && !eventIsAllowed(event, progress, options.currentScene)) return false;
  if (event.once) progress.firedEventIds = unique([...progress.firedEventIds, event.id]);
  result.firedEventIds.push(event.id);
  if (event.playerVisible && event.narrativeCue) result.narrativeCues.push(event.narrativeCue);
  for (const effect of event.effects) applyEffect(progress, effect, result, options.actorName, options.random ?? Math.random);
  updateStructuralStates(progress, options.currentScene);
  return true;
}

function runAutomaticEvents(result: ScenarioTransitionResult, options: ProcessScenarioTurnOptions): void {
  for (let pass = 0; pass < scenario.progression.storyEvents.length + 1; pass += 1) {
    let changed = false;
    for (const event of scenario.progression.storyEvents) {
      if (event.trigger !== 'automatic' || recoveryEventIds.has(event.id)) continue;
      if (fireEvent(event, result, options)) changed = true;
    }
    if (!changed) break;
  }
}

function settleEnding(result: ScenarioTransitionResult, options: ProcessScenarioTurnOptions): void {
  const progress = result.progress;
  const selected = scenario.progression.endings
    .filter((ending) => progress.endingId === ending.id || evaluateScenarioCondition(ending.when, progress, options.currentScene))
    .sort((left, right) => right.priority - left.priority)[0];
  if (!selected) return;
  progress.endingId = selected.id;
  if (progress.settledEndingIds.includes(selected.id)) return;
  progress.settledEndingIds.push(selected.id);
  for (const effect of selected.effects) applyEffect(progress, effect, result, options.actorName, options.random ?? Math.random);
  result.narrativeCues.push(`${selected.title}：${selected.summary}`);
}

export function processScenarioTurn(
  source: ScenarioProgress,
  options: ProcessScenarioTurnOptions
): ScenarioTransitionResult {
  const result: ScenarioTransitionResult = {
    progress: cloneProgress(source),
    firedEventIds: [],
    narrativeCues: [],
    deltas: [],
    requestedCheck: null,
    softPrompt: null
  };
  const progress = result.progress;
  if (progress.endingId) return result;

  if (options.checkResult) progress.lastCheckOutcomes[options.checkResult.id] = options.checkResult.outcome;
  if (!progress.visitedSceneIds.includes(options.currentScene)) progress.visitedSceneIds.push(options.currentScene);
  if (options.previousScene && options.previousScene !== options.currentScene) {
    const exit = scenesById.get(options.previousScene)?.exits.find((item) => item.to === options.currentScene);
    if (exit) advanceTime(progress, exit.travelMinutes);
  }
  updateStructuralStates(progress, options.currentScene);

  if (options.previousScene && options.previousScene !== options.currentScene) {
    // Scene-entry eligibility is atomic. One entry event may complete its beat,
    // but that must not suppress sibling events that were valid at the instant
    // the party entered the scene.
    const entryEvents = scenario.progression.storyEvents.filter((event) =>
      event.trigger === 'sceneEnter' && eventIsAllowed(event, progress, options.currentScene)
    );
    for (const event of entryEvents) fireEvent(event, result, options, true);
  }
  for (const id of unique(options.storyEventIds ?? [])) {
    const event = eventsById.get(id);
    if (event?.trigger === 'manual') fireEvent(event, result, options);
  }
  if (options.checkResult) {
    for (const event of scenario.progression.storyEvents) {
      if (event.trigger === 'checkResolved'
        && conditionReferencesCheck(event.when, options.checkResult.id)) {
        fireEvent(event, result, options);
      }
    }
  }
  runAutomaticEvents(result, options);

  const madeProgressThisPass = result.firedEventIds.length > 0
    || Boolean(options.previousScene && options.previousScene !== options.currentScene)
    || Boolean(options.checkResult);
  if (madeProgressThisPass) progress.lastProgressTurn = options.turn;

  if (options.completeTurn && !result.requestedCheck) {
    for (const rule of scenario.rules.entries) {
      if (rule.support !== 'enforced' || rule.trigger !== 'afterAction') continue;
      if (!evaluateScenarioCondition(rule.when, progress, options.currentScene)) continue;
      for (const effect of rule.effects) applyEffect(progress, effect, result, options.actorName, options.random ?? Math.random);
    }
    for (const event of scenario.progression.storyEvents) {
      if (event.trigger === 'turnEnd') fireEvent(event, result, options);
    }
    const madeProgress = madeProgressThisPass
      || (options.turn > 0 && progress.lastProgressTurn === options.turn);
    progress.idleTurns = madeProgress ? 0 : progress.idleTurns + 1;

    const activeMandatory = scenario.progression.beats.find((beat) =>
      progress.beatStates[beat.id] === 'active' && (beat.kind === 'mandatory' || beat.kind === 'finale')
    );
    if (activeMandatory) {
      if (activeMandatory.softEscalationAfter > 0 && progress.idleTurns >= activeMandatory.softEscalationAfter) {
        result.softPrompt = activeMandatory.softPrompt;
      }
      if (activeMandatory.hardRecoveryAfter > 0
        && progress.idleTurns >= activeMandatory.hardRecoveryAfter
        && activeMandatory.recoveryEventId) {
        const recovery = eventsById.get(activeMandatory.recoveryEventId);
        if (recovery && fireEvent(recovery, result, options)) {
          progress.idleTurns = 0;
          progress.lastProgressTurn = options.turn;
        }
      }
    }
  }
  runAutomaticEvents(result, options);
  settleEnding(result, options);
  return result;
}

export function getAvailableSceneExits(
  progress: ScenarioProgress,
  currentScene: SceneId
): Array<{ sceneId: SceneId; travelMinutes: number; blockedText: string }> {
  return (scenesById.get(currentScene)?.exits ?? [])
    .filter((exit) => evaluateScenarioCondition(exit.when, progress, currentScene))
    .map((exit) => ({ sceneId: exit.to, travelMinutes: exit.travelMinutes, blockedText: exit.blockedText }));
}

export function getAvailableStoryEvents(progress: ScenarioProgress, currentScene: SceneId): StoryEvent[] {
  return scenario.progression.storyEvents.filter((event) =>
    event.trigger === 'manual' && eventIsAllowed(event, progress, currentScene)
  );
}

export function getActiveScenarioBeat(progress: ScenarioProgress, currentScene?: SceneId) {
  return scenario.progression.beats
    .filter((beat) =>
      progress.beatStates[beat.id] === 'active'
      && (!currentScene || beat.sceneIds.includes(currentScene))
    )
    .sort((left, right) => {
      const leftAct = scenario.progression.acts.find((act) => act.id === left.actId)?.order ?? 0;
      const rightAct = scenario.progression.acts.find((act) => act.id === right.actId)?.order ?? 0;
      if (leftAct !== rightAct) return rightAct - leftAct;
      const kindPriority = { optional: 0, recovery: 1, mandatory: 2, finale: 3 } as const;
      return kindPriority[right.kind] - kindPriority[left.kind];
    })[0] ?? null;
}

export function getVisibleScenarioObjectives(progress: ScenarioProgress) {
  const activeActOrder = scenario.progression.acts.find((act) => act.id === progress.activeActId)?.order ?? 0;
  return scenario.progression.objectives.filter((objective) => {
    const status = progress.objectiveStates[objective.id];
    if (status === 'locked') return false;
    if (status === 'completed' || status === 'failed') return true;
    const beat = beatsById.get(objective.beatId);
    const objectiveActOrder = scenario.progression.acts.find((act) => act.id === beat?.actId)?.order ?? 0;
    return beat?.kind !== 'optional' || objectiveActOrder >= activeActOrder;
  });
}

export function getScenarioDefinition() {
  return scenario;
}

export function migrateLegacyScenarioProgress(input: {
  currentScene: SceneId;
  clueIds: string[];
  flags: Record<string, unknown>;
  turn: number;
}): ScenarioProgress {
  const progress = createScenarioProgress();
  progress.migrationLog.push('v1-v7 -> v8：根据场景、线索和旧 flags 保守恢复；未补发入场事件、SAN 或奖励。');
  progress.visitedSceneIds = unique([
    scenario.manifest.startSceneId,
    ...scenario.world.scenes.filter((scene) => input.flags[`sceneVisited.${scene.id}`] === true).map((scene) => scene.id),
    input.currentScene
  ]);
  for (const id of input.clueIds) {
    if (id in progress.clueStates) progress.clueStates[id] = 'discovered';
  }
  if (input.flags.met_montreal === true || input.flags.metMontreal === true) progress.variables.metMontreal = true;
  if (input.flags.oldHethLead === true) progress.variables.oldHethLead = true;
  progress.variables.commissionAccepted = true;
  progress.knownFactIds.push('F04');
  progress.beatStates.B01 = 'completed';
  progress.objectiveStates.O01 = 'completed';
  progress.firedEventIds.push('EV_ACCEPT_COMMISSION');

  const markHouseDone = () => {
    progress.beatStates.B02 = 'completed';
    progress.objectiveStates.O02 = 'completed';
  };
  if (input.clueIds.includes('I02')) progress.knownFactIds.push('F05');
  if (input.clueIds.includes('I04')) progress.knownFactIds.push('F06');
  if (input.clueIds.includes('I05')) progress.knownFactIds.push('F07');
  if (input.clueIds.includes('I07')) progress.knownFactIds.push('F09');
  if (input.clueIds.includes('I08')) progress.knownFactIds.push('F10');

  if (input.currentScene !== 'S01' || input.clueIds.length) markHouseDone();
  if (input.currentScene === 'S02') {
    progress.knownFactIds.push('F05');
    markHouseDone();
    progress.beatStates.B03 = 'active';
  } else if (input.currentScene === 'S03') {
    progress.variables.oldHethLead = true;
    markHouseDone();
    progress.beatStates.B04 = 'active';
  } else if (input.currentScene === 'S04') {
    progress.knownFactIds.push('F06');
    markHouseDone();
    progress.beatStates.B05 = 'active';
  } else if (input.currentScene === 'S05') {
    progress.knownFactIds.push('F06', 'F09');
    markHouseDone();
    progress.beatStates.B05 = 'completed';
    progress.objectiveStates.O05 = 'completed';
    progress.beatStates.B06 = 'active';
  }
  progress.knownFactIds = unique(progress.knownFactIds);
  progress.lastProgressTurn = input.turn;
  updateStructuralStates(progress, input.currentScene);
  return progress;
}

const STEP_STATUSES = new Set<ScenarioStepStatus>(['locked', 'active', 'completed', 'failed']);
const CLUE_STATUSES = new Set<ScenarioClueStatus>(['unknown', 'discovered', 'analyzed', 'destroyed']);
const CHECK_OUTCOMES = new Set<DiceResult['level']>(['crit', 'hard', 'success', 'fail', 'fumble']);
const ENCOUNTER_STATES = new Set<ScenarioEncounterState['state']>([
  'inactive', 'active', 'won', 'lost', 'resolved'
]);

function invalidScenarioState(field: string, detail: string): never {
  throw new ScenarioContentMismatchError(`存档剧情状态 ${field} 无效：${detail}`);
}

function strictRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidScenarioState(field, '应为对象');
  }
  return value as Record<string, unknown>;
}

function knownIdList(value: unknown, allowed: ReadonlySet<string>, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalidScenarioState(field, '应为 ID 数组');
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) {
      invalidScenarioState(field, `未知 ID ${String(item)}`);
    }
    out.push(item);
  }
  return unique(out);
}

function statusMap<T extends string>(
  value: unknown,
  base: Record<string, T>,
  allowedIds: ReadonlySet<string>,
  allowedValues: ReadonlySet<T>,
  field: string
): Record<string, T> {
  const source = strictRecord(value, field);
  const out = { ...base };
  for (const [id, status] of Object.entries(source)) {
    if (!allowedIds.has(id)) invalidScenarioState(field, `未知 ID ${id}`);
    if (typeof status !== 'string' || !allowedValues.has(status as T)) {
      invalidScenarioState(`${field}.${id}`, `未知状态 ${String(status)}`);
    }
    out[id] = status as T;
  }
  return out;
}

function storedVariables(value: unknown, base: ScenarioProgress['variables']): ScenarioProgress['variables'] {
  const source = strictRecord(value, 'variables');
  const out = { ...base };
  for (const [id, variableValue] of Object.entries(source)) {
    const expectedType = variableTypes.get(id);
    if (!expectedType) invalidScenarioState('variables', `未知变量 ${id}`);
    if (typeof variableValue !== expectedType) {
      invalidScenarioState(`variables.${id}`, `预期 ${expectedType}，实际 ${typeof variableValue}`);
    }
    out[id] = variableValue as string | number | boolean;
  }
  return out;
}

function storedClocks(value: unknown): ScenarioProgress['clocks'] {
  const source = strictRecord(value, 'clocks');
  const out: ScenarioProgress['clocks'] = {};
  for (const [id, rawClock] of Object.entries(source)) {
    if (!clockIds.has(id)) invalidScenarioState('clocks', `未知时钟 ${id}`);
    const clock = strictRecord(rawClock, `clocks.${id}`);
    if (typeof clock.value !== 'number' || !Number.isFinite(clock.value)) {
      invalidScenarioState(`clocks.${id}`, '时钟 value 必须是有限数字');
    }
    if (typeof clock.active !== 'boolean' || typeof clock.visible !== 'boolean') {
      invalidScenarioState(`clocks.${id}`, 'active/visible 必须是布尔值');
    }
    out[id] = { value: clock.value, active: clock.active, visible: clock.visible };
  }
  return out;
}

function storedEncounters(
  value: unknown,
  base: ScenarioProgress['encounters']
): ScenarioProgress['encounters'] {
  const source = strictRecord(value, 'encounters');
  const out = Object.fromEntries(Object.entries(base).map(([id, encounter]) => [id, { ...encounter }]));
  for (const [id, rawEncounter] of Object.entries(source)) {
    if (!encounterIds.has(id)) invalidScenarioState('encounters', `未知遭遇 ${id}`);
    const encounter = strictRecord(rawEncounter, `encounters.${id}`);
    const state = encounter.state;
    if (typeof state !== 'string' || !ENCOUNTER_STATES.has(state as ScenarioEncounterState['state'])) {
      invalidScenarioState(`encounters.${id}.state`, String(state));
    }
    const numericFields = ['round', 'defeated', 'opponentHp'] as const;
    for (const field of numericFields) {
      if (typeof encounter[field] !== 'number' || !Number.isFinite(encounter[field]) || encounter[field] < 0) {
        invalidScenarioState(`encounters.${id}.${field}`, String(encounter[field]));
      }
    }
    out[id] = {
      state: state as ScenarioEncounterState['state'],
      round: encounter.round as number,
      defeated: encounter.defeated as number,
      opponentHp: encounter.opponentHp as number,
      ...(typeof encounter.route === 'string' && encounter.route ? { route: encounter.route } : {})
    };
  }
  return out;
}

function storedCheckOutcomes(value: unknown): ScenarioProgress['lastCheckOutcomes'] {
  const source = strictRecord(value, 'lastCheckOutcomes');
  const out: ScenarioProgress['lastCheckOutcomes'] = {};
  for (const [id, outcome] of Object.entries(source)) {
    if (!checkIds.has(id)) invalidScenarioState('lastCheckOutcomes', `未知检定 ${id}`);
    if (typeof outcome !== 'string' || !CHECK_OUTCOMES.has(outcome as DiceResult['level'])) {
      invalidScenarioState(`lastCheckOutcomes.${id}`, String(outcome));
    }
    out[id] = outcome as DiceResult['level'];
  }
  return out;
}

function nonNegativeInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    invalidScenarioState(field, String(value));
  }
  return value;
}

export function hydrateScenarioProgress(
  value: unknown,
  legacy: Parameters<typeof migrateLegacyScenarioProgress>[0]
): ScenarioProgress {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return migrateLegacyScenarioProgress(legacy);
  if (raw.moduleId !== scenario.manifest.id) {
    throw new ScenarioContentMismatchError(`存档模组 ${String(raw.moduleId)} 与当前模组 ${scenario.manifest.id} 不匹配`);
  }
  const storedContentKey = `${String(raw.moduleVersion)}#${String(raw.contentHash)}`;
  const currentContent = raw.moduleVersion === scenario.manifest.contentVersion
    && raw.contentHash === scenarioContentHash;
  const knownPreviousContent = previousContentVersions.has(storedContentKey);
  if (!currentContent && !knownPreviousContent) {
    throw new ScenarioContentMismatchError(
      `存档内容 ${String(raw.moduleVersion)}#${String(raw.contentHash)} 没有到 ${scenario.manifest.contentVersion}#${scenarioContentHash} 的迁移函数`
    );
  }
  const base = createScenarioProgress();
  const source = raw as unknown as ScenarioProgress;
  const worldTime = source.worldTime ?? base.worldTime;
  if (typeof worldTime !== 'string' || !Number.isFinite(parseWorldTime(worldTime))) {
    invalidScenarioState('worldTime', String(worldTime));
  }
  const activeActId = source.activeActId ?? base.activeActId;
  if (typeof activeActId !== 'string' || !actIds.has(activeActId)) {
    invalidScenarioState('activeActId', String(activeActId));
  }
  const endingId = source.endingId ?? null;
  if (endingId !== null && (typeof endingId !== 'string' || !endingIds.has(endingId))) {
    invalidScenarioState('endingId', `未知结局 ${String(endingId)}`);
  }
  const hydrated: ScenarioProgress = {
    ...base,
    moduleId: scenario.manifest.id,
    moduleVersion: scenario.manifest.contentVersion,
    contentHash: scenarioContentHash,
    worldTime,
    activeActId,
    beatStates: statusMap(source.beatStates, base.beatStates, beatIds, STEP_STATUSES, 'beatStates'),
    objectiveStates: statusMap(source.objectiveStates, base.objectiveStates, objectiveIds, STEP_STATUSES, 'objectiveStates'),
    knownFactIds: knownIdList(source.knownFactIds, factIds, 'knownFactIds'),
    clueStates: statusMap(source.clueStates, base.clueStates, clueIds, CLUE_STATUSES, 'clueStates'),
    firedEventIds: knownIdList(source.firedEventIds, eventIds, 'firedEventIds'),
    settledEndingIds: knownIdList(source.settledEndingIds, endingIds, 'settledEndingIds'),
    variables: storedVariables(source.variables, base.variables),
    clocks: storedClocks(source.clocks),
    encounters: storedEncounters(source.encounters, base.encounters),
    lastCheckOutcomes: storedCheckOutcomes(source.lastCheckOutcomes),
    visitedSceneIds: knownIdList(source.visitedSceneIds ?? [legacy.currentScene], sceneIds, 'visitedSceneIds'),
    lastProgressTurn: nonNegativeInteger(source.lastProgressTurn, 0, 'lastProgressTurn'),
    idleTurns: nonNegativeInteger(source.idleTurns, 0, 'idleTurns'),
    endingId,
    migrationLog: Array.isArray(source.migrationLog)
      ? source.migrationLog.filter((item): item is string => typeof item === 'string')
      : []
  };
  if (knownPreviousContent) {
    for (const beat of scenario.progression.beats) {
      const status = hydrated.beatStates[beat.id];
      if (status === 'active') activateBeat(hydrated, beat.id);
      else if (status === 'completed' || status === 'failed') settleBeat(hydrated, beat.id, status);
    }
    if (hydrated.variables.finaleRoute === 'combat'
      && hydrated.objectiveStates.O07 === 'locked') hydrated.objectiveStates.O07 = 'active';
    if (hydrated.variables.finaleRoute === 'negotiation'
      && hydrated.objectiveStates.O08 === 'locked') hydrated.objectiveStates.O08 = 'active';
    if (hydrated.encounters.ENC02.state === 'active') {
      hydrated.encounters.ENC02.state = 'resolved';
    }
    const combat = hydrated.encounters.ENC01;
    const escapeClock = hydrated.clocks.fusangEscape;
    if (storedContentKey === '1.1.6#6204fadbf9c5cf3f'
      && hydrated.variables.finaleRoute === 'combat'
      && !hydrated.endingId
      && combat.state === 'active'
      && escapeClock?.active
      && escapeClock.value > 0) {
      escapeClock.value -= 1;
      combat.round = Math.max(0, combat.round - 1);
      hydrated.variables.combatRoundStarted = combat.round > 0;
      hydrated.migrationLog.push('1.1.7：撤回选择战斗路线时误推进的一轮逃脱时钟，恢复完整七个战斗回合。');
    }
    const mapWasOnlyGrantedByEntry = autoMapContentVersions.has(storedContentKey)
      && legacy.currentScene === 'S04'
      && !hydrated.visitedSceneIds.includes('S05')
      && hydrated.variables.finaleRoute === 'undecided'
      && hydrated.firedEventIds.includes('EV_S04_MAP')
      && !hydrated.firedEventIds.some((id) => id === 'EV_FAIL_I07'
        || id === 'EV_PHARMACY_RECOVERY'
        || id === 'EV_RECOVER_I07');
    if (mapWasOnlyGrantedByEntry) {
      hydrated.clueStates.I07 = 'unknown';
      hydrated.knownFactIds = hydrated.knownFactIds.filter((id) => id !== 'F09');
      hydrated.firedEventIds = hydrated.firedEventIds.filter((id) => id !== 'EV_S04_MAP');
      hydrated.beatStates.B05 = 'active';
      hydrated.objectiveStates.O05 = 'active';
      hydrated.beatStates.B06 = 'locked';
      hydrated.objectiveStates.O06 = 'locked';
      hydrated.activeActId = 'A02';
      hydrated.migrationLog.push('1.1.6：撤回旧版进入药店时自动授予的地图，保留现场并恢复为可调查状态。');
    }
    hydrated.migrationLog.push(
      `模组内容 ${String(raw.moduleVersion)} -> ${scenario.manifest.contentVersion}：同步规则、目标状态与终幕检定，保留既有剧情进度。`
    );
  }
  return hydrated;
}

export function getScenarioProgressForState(state: {
  scenarioProgress?: ScenarioProgress;
  currentScene: SceneId;
  clues?: Array<{ id: string }>;
  flags?: Record<string, unknown>;
  conversationHistory?: Array<{ role: string; content?: unknown }>;
}): ScenarioProgress {
  if (state.scenarioProgress) return state.scenarioProgress;
  return migrateLegacyScenarioProgress({
    currentScene: state.currentScene,
    clueIds: (state.clues ?? []).map((clue) => clue.id),
    flags: state.flags ?? {},
    turn: countCompletedGameTurns(state.conversationHistory ?? [])
  });
}

export function isDeclaredScenarioVariable(key: string): boolean {
  return declaredVariables.has(key);
}

export function npcIdFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  return scenario.world.npcs.find((npc) => npc.name === name || npc.aliases.includes(name))?.id ?? null;
}

export function npcNameFromId(id: string | null | undefined): string | null {
  if (!id) return null;
  return scenario.world.npcs.find((npc) => npc.id === id)?.name ?? null;
}
