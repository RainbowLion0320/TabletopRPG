import type {
  CheckContinuationAction,
  CheckRequest,
  DiceResult,
  Investigator
} from '../types/game';
import {
  gameRules,
  getDifficultyThreshold,
  isFumbleRoll,
  isLuckSkill,
  normalizeDifficultyLabel
} from '../data/gameRules';

export function getSkillTotal(player: Investigator, skill: string) {
  if (isLuckSkill(skill)) {
    return player.luck ?? player.attrs.Luck;
  }
  const value = player.skills[skill];
  return value ? value.base + value.added : gameRules.skills.unknownSkillTotal;
}

export function prepareCheck(check: CheckRequest, players: Investigator[]): CheckRequest {
  const player = players.find((item) => item.name === check.player) ?? players[0];
  const skillVal = player ? getSkillTotal(player, check.skill) : gameRules.skills.unknownSkillTotal;
  const difficulty = normalizeDifficultyLabel(check.difficulty);
  const queuedChecks = check.queuedChecks?.map((queued) => {
    const queuedPlayer = players.find((item) => item.name === queued.player) ?? players[0];
    const queuedSkillVal = queuedPlayer
      ? getSkillTotal(queuedPlayer, queued.skill)
      : gameRules.skills.unknownSkillTotal;
    const queuedDifficulty = normalizeDifficultyLabel(queued.difficulty);
    return {
      ...queued,
      queuedChecks: undefined,
      difficulty: queuedDifficulty,
      skillVal: queuedSkillVal,
      threshold: getDifficultyThreshold(queuedSkillVal, queuedDifficulty)
    };
  });
  return {
    ...check,
    difficulty,
    skillVal,
    threshold: getDifficultyThreshold(skillVal, difficulty),
    queuedChecks: queuedChecks?.length ? queuedChecks : undefined
  };
}

export function chainChecks(
  checks: CheckRequest[],
  continuationActions: CheckContinuationAction[] = []
): CheckRequest | null {
  if (!checks.length) return null;
  const batchTotal = checks.length;
  const normalized = checks.map((check, index) => ({
    ...check,
    queuedChecks: undefined,
    continuationActions: undefined,
    resolvedActions: undefined,
    batchIndex: index + 1,
    batchTotal
  }));
  return {
    ...normalized[0],
    continuationActions: continuationActions.length ? continuationActions : undefined,
    queuedChecks: normalized.length > 1 ? normalized.slice(1) : undefined
  };
}

export function advanceCheckQueue(
  current: CheckRequest,
  resultAction: CheckContinuationAction | undefined,
  players: Investigator[]
): CheckRequest | null {
  const [next, ...rest] = current.queuedChecks ?? [];
  if (!next) return null;
  return prepareCheck({
    ...next,
    queuedChecks: rest.length ? rest : undefined,
    continuationActions: current.continuationActions,
    resolvedActions: [
      ...(current.resolvedActions ?? []),
      ...(resultAction ? [resultAction] : [])
    ],
    batchIndex: next.batchIndex ?? (current.batchIndex ?? 1) + 1,
    batchTotal: current.batchTotal ?? 1 + rest.length
  }, players);
}

export function enqueueCheck(
  current: CheckRequest | null,
  incoming: CheckRequest,
  players: Investigator[]
): CheckRequest {
  if (!current) return prepareCheck(incoming, players);
  const isSameAuthoredCheck = (check: CheckRequest) => Boolean(
    incoming.scenarioCheckId
    && check.scenarioCheckId === incoming.scenarioCheckId
    && check.player === incoming.player
    && check.skill === incoming.skill
  );
  if (isSameAuthoredCheck(current)
    || (current.queuedChecks ?? []).some(isSameAuthoredCheck)) return current;
  const queued = [
    ...(current.queuedChecks ?? []),
    { ...incoming, queuedChecks: undefined, continuationActions: undefined, resolvedActions: undefined }
  ];
  const batchTotal = Math.max(current.batchTotal ?? 1, (current.batchIndex ?? 1) + queued.length);
  return prepareCheck({
    ...current,
    batchTotal,
    queuedChecks: queued.map((check, index) => ({
      ...check,
      batchIndex: (current.batchIndex ?? 1) + index + 1,
      batchTotal
    }))
  }, players);
}

export function rollD100(check: CheckRequest): DiceResult {
  const roll = Math.floor(Math.random() * gameRules.dice.sides) + 1;
  const skillVal = check.skillVal ?? check.threshold ?? gameRules.skills.unknownSkillTotal;
  const requiredThreshold = getDifficultyThreshold(skillVal, check.difficulty);

  if (isFumbleRoll(roll)) {
    return { roll, level: 'fumble', label: `大失败（${roll}）` };
  }
  if (roll > requiredThreshold) {
    return { roll, level: 'fail', label: `失败（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '极难')) {
    return { roll, level: 'crit', label: `极难成功（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '困难')) {
    return { roll, level: 'hard', label: `困难成功（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '普通')) {
    return { roll, level: 'success', label: `普通成功（${roll}）` };
  }
  return { roll, level: 'fail', label: `失败（${roll}）` };
}
