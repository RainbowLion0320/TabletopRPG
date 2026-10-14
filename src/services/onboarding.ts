import type { AiResponse, CheckContinuationAction, CheckRequest, DiceResult, GameState, OnboardingState } from '../types/game';
import { getScenarioDefinition } from '../scenario/engine';
import { prepareCheck } from './dice';
import { normalizeDifficultyLabel } from '../data/gameRules';

const photo = getScenarioDefinition().world.items.find((item) => item.id === 'I02')!;
const steps = ['action', 'search', 'roll', 'records', 'character', 'finish', 'done', 'skipped'] as const;
const firstActions = [
  '接受委托，询问埃里克失踪的经过',
  '询问伊莎贝拉是否记得父亲常去的地方',
  '记录埃里克失踪的日期和警方的调查情况',
  '询问伊莎贝拉是否方便让我们检查书房'
];
const searchActions = [
  '检查书桌抽屉，寻找与失踪有关的线索',
  '请伊莎贝拉补充她亲眼确认的失踪经过',
  '记录书房物品的位置，协助查找线索',
  '守在书房门口，留意周围动静'
];

export function isOnboardingActive(state: GameState): boolean {
  return Boolean(state.onboarding && !['done', 'skipped'].includes(state.onboarding.step) && !state.scenarioProgress.endingId);
}

export function isOnboardingAction(state: GameState): boolean {
  return state.onboarding?.step === 'action' || state.onboarding?.step === 'search';
}

export function guidedDeclaration(state: GameState, playerId: string): string | undefined {
  if (!isOnboardingAction(state)) return undefined;
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) return undefined;
  return (state.onboarding?.step === 'action' ? firstActions : searchActions)[index];
}

/** Fixed replies are only for the displayed lesson actions, never arbitrary declarations. */
export function buildOnboardingTurn(state: GameState, actions: CheckContinuationAction[]): { response: AiResponse; onboarding: OnboardingState } | null {
  if (!isOnboardingAction(state) || state.currentScene !== 'S01' || !state.players.length
    || actions.length !== state.players.length || actions.some((action, index) =>
      action.player !== state.players[index].name || action.action !== guidedDeclaration(state, state.players[index].id))) return null;

  const lead = state.players[0];
  if (state.onboarding?.step === 'action') {
    return {
      response: {
        activeNpc: '伊莎贝拉·摩勒',
        narrative: `听到${lead.name}愿意接下委托，伊莎贝拉终于松了一口气。\n\n“父亲是7月10日失踪的，警方至今没有进展。他平日常去老赫特酒吧。您若想看看他的书房，我可以带路。”\n\n她推开书房的门，示意${state.players.length === 1 ? '你' : '你们'}可以从父亲的书桌查起。`,
        stateUpdate: { storyEventIds: ['EV_ACCEPT_COMMISSION'] },
        playerChoices: Object.fromEntries(state.players.map((player, index) => [player.id, [searchActions[index]]]))
      },
      onboarding: { version: 1, step: 'search' }
    };
  }

  return {
    response: {
      activeNpc: '伊莎贝拉·摩勒',
      narrative: `${lead.name}走到书桌旁，小心拉开抽屉。里面的纸张和文件叠在一起，需要仔细翻查，才能判断哪些与失踪有关。${state.players.length > 1 ? '\n\n其余调查员留在一旁，继续询问、记录并留意书房里的动静。' : ''}`,
      check: prepareCheck({
        player: lead.name,
        skill: photo.discovery!.skill,
        difficulty: normalizeDifficultyLabel(photo.discovery!.difficulty),
        reason: '翻查书桌抽屉，寻找失踪线索',
        continuationActions: actions,
        resolution: {
          kind: 'authored', targetItemIds: [photo.id],
          success: '在书桌抽屉里发现合影，确认埃里克与蒙特利尔的联系。',
          failure: photo.discovery!.failForward
        }
      }, state.players)
    },
    onboarding: { version: 1, step: 'roll', pendingPhotoCheck: true }
  };
}

function isLessonCheck(check: CheckRequest | null | undefined, state: GameState): boolean {
  return Boolean(check && check.player === state.players[0]?.name && check.skill === photo.discovery!.skill
    && check.difficulty === photo.discovery!.difficulty && !check.queuedChecks?.length
    && check.resolution?.kind === 'authored' && check.resolution.targetItemIds?.length === 1
    && check.resolution.targetItemIds[0] === photo.id);
}

/** The reducer settles approved scenario events only after the player's real roll. */
export function buildOnboardingRoll(state: GameState, check: CheckRequest, result: DiceResult): { response: AiResponse; onboarding: OnboardingState } | null {
  if (!state.onboarding?.pendingPhotoCheck || state.currentScene !== 'S01' || !isLessonCheck(check, state)
    || !['roll', 'skipped'].includes(state.onboarding.step) || state.scenarioProgress.clueStates.I02 !== 'unknown') return null;
  const success = !['fail', 'fumble'].includes(result.level);
  return {
    response: {
      activeNpc: '伊莎贝拉·摩勒',
      narrative: success
        ? `${check.player}从文件间找到一张旧合影。照片里，埃里克与另一名男子并肩站着，神情十分熟络。\n\n伊莎贝拉认出那是洛夫·蒙特利尔局长。既然两人关系如此亲近，警局或许能提供更多答案；父亲常去的老赫特酒吧也值得走一趟。`
        : `${check.player}翻查时弄乱了抽屉，响动引来了伊莎贝拉。整理散落的文件耽误了十分钟，却也露出一张旧合影。\n\n她认出照片里与埃里克并肩站着的是洛夫·蒙特利尔局长。虽然查找不够顺利，调查仍有了方向：可以带着合影去警局询问，或先去父亲常去的老赫特酒吧。`,
      stateUpdate: { storyEventIds: [success ? photo.discovery!.successEventId : photo.discovery!.failureEventId] },
      playerChoices: ['询问伊莎贝拉对合影的记忆', '带着合影前往警局询问', '前往老赫特酒吧调查']
    },
    onboarding: { version: 1, step: state.onboarding.step === 'skipped' ? 'skipped' : 'records' }
  };
}

/** Missing or incompatible lesson metadata never inserts a guide into an old save. */
export function normalizeOnboarding(value: unknown, state: GameState): OnboardingState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || !steps.includes(source.step as typeof steps[number]) || !state.players.length || state.scenarioProgress.endingId) return undefined;
  const step = source.step as OnboardingState['step'];
  const found = state.scenarioProgress.clueStates.I02 !== 'unknown';
  const ownsCheck = source.pendingPhotoCheck === true && state.currentScene === 'S01' && !found && isLessonCheck(state.pendingCheck, state);
  if (['action', 'search', 'roll'].includes(step) && state.currentScene !== 'S01') return undefined;
  if (step === 'action' && (state.scenarioProgress.variables.commissionAccepted || state.conversationHistory.length)) return undefined;
  if (step === 'search' && (!state.scenarioProgress.variables.commissionAccepted || found || state.pendingCheck)) return undefined;
  if (step === 'roll' && !ownsCheck) return undefined;
  if (['records', 'character', 'finish'].includes(step) && !found) return undefined;
  return {
    version: 1, step,
    ...(ownsCheck ? { pendingPhotoCheck: true } : {}),
    ...(source.openedPanel === step && (step === 'records' || step === 'character') ? { openedPanel: step } : {})
  };
}
