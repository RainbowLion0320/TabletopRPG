import type { AiResponse, CheckRequest, GameState, SceneId } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import { getDmRequestTurn } from '../services/turns';
import type { DmToolCall, KnowledgeBase } from './types';
import { getActiveKnowledgeBase } from './knowledgeBase';
import { COMBAT_ACTION_RE, hasAffirmativeMatch } from '../services/actionIntent';
import { buildFinaleSuggestions, isFinaleChoiceCompatible } from '../services/finaleChoices';
import {
  getScenarioDefinition,
  getAvailableSceneExits,
  getAvailableStoryEvents,
  getScenarioProgressForState,
  processScenarioTurn
} from '../scenario/engine';

const DICE_RESULT_RE = /【检定结果】|结果[：:]\s*(?:失败|大失败|成功|困难成功|极难成功|大成功)/;
const MOVE_VERB_RE = /前往|赶往|去往|转往|改去|改从|出发|动身|返回|回到|离开|进入|走进|登上|开车|驾车|驱车|驶向|跟随|追到|抵达|到达/;
const MOVE_DESTINATION_RE = /前往|赶往|去往|转往|改去|改从|驶向|追到|抵达|到达|进入|登上|回到|返回|去/;
const NPC_ROLE_TERMS = ['店主', '老板', '伙计', '服务生', '医生', '护士', '牧师', '管理员', '警员', '警察', '酒保'];

function undeclaredPrecinctMention(text: string, registeredTerms: string[]): string | null {
  const withoutRegisteredTerms = registeredTerms
    .sort((left, right) => right.length - left.length)
    .reduce((remaining, term) => remaining.split(term).join(''), text);
  const withoutGenericMovement = withoutRegisteredTerms.replace(
    /(?:离开|走出|返回|回到|进入|走进|抵达|到达|来到|赶到|推开|走向|前往|赶往|去往|转往|驶向)(?:了|这座|这栋|当地|当前|眼前的)?(?:分局|警察局|警局)/g,
    ''
  );

  return withoutGenericMovement.match(
    /(?:第[一二三四五六七八九十百\d]{1,4}|[\u4e00-\u9fff]{1,6}区)分局|[\u4e00-\u9fff]{2,6}(?:警察局|警局)/
  )?.[0] ?? null;
}

interface CheckCandidate {
  score: number;
  check: CheckRequest;
}

function onlyRequestsPermissionToInvestigate(text: string): boolean {
  return /(?:可否|能否|是否可以|可不可以|请求(?:对方)?允许|征得(?:同意|许可))[^，。；！？\n]{0,18}(?:查看|检查|搜查|进入)/.test(text)
    && !/(?:获准|得到允许|经同意|随后|然后|立即)[^，。；！？\n]{0,12}(?:查看|检查|搜查|进入)/.test(text);
}

function buildCandidate(action: PlayerAction): CheckCandidate | null {
  const text = action.action.trim();
  if (!text || DICE_RESULT_RE.test(text)) return null;
  if (onlyRequestsPermissionToInvestigate(text)) return null;
  const describesAssistingAnother = /(?:在|当)(?:他|她|同伴|队友|[\u4e00-\u9fff·]{2,10})[^，。；！？\n]{0,24}时[^。；！？\n]{0,16}(?:提供照明|警戒|把风|记录|协助|帮助|配合)/.test(text)
    || /(?:协助|帮助|配合)(?:他|她|同伴|队友|[\u4e00-\u9fff·]{2,10})[^，。；！？\n]{0,16}(?:操作|检查|搜查|撬锁|开锁|撬开)/.test(text);

  if (actionUsesHandgun(text)) {
    return {
      score: 100 - (describesAssistingAnother ? 50 : 0),
      check: {
        player: action.player,
        skill: '射击（手枪）',
        difficulty: '困难',
        reason: '在压力下完成射击'
      }
    };
  }

  const specs: Array<{
    pattern: RegExp;
    skill: string;
    score: number;
    difficulty?: CheckRequest['difficulty'];
    reason: string;
  }> = [
    { pattern: /开枪|射击|瞄准|扣扳机/, skill: '射击（手枪）', score: 100, difficulty: '困难', reason: '在压力下完成射击' },
    { pattern: COMBAT_ACTION_RE, skill: '格斗（拳）', score: 95, difficulty: '困难', reason: '冲突行动存在受伤风险' },
    { pattern: /闪避(?!过|的|结果)|躲开|避开|逃脱/, skill: '闪避', score: 92, difficulty: '困难', reason: '避开迫近的危险' },
    { pattern: /潜入|潜行|蹑手蹑脚|躲藏|尾随/, skill: '潜行', score: 88, reason: '不被察觉地完成行动' },
    { pattern: /撬锁|开锁|撬开|拆开|修理|修复/, skill: '机械维修', score: 84, reason: '完成精细的机械操作' },
    { pattern: /高速|追车|甩开|危险驾驶|强行驾车/, skill: '驾驶（汽车）', score: 82, difficulty: '困难', reason: '在危险条件下驾驶' },
    { pattern: /急救(?!包|箱|器材)|止血|包扎|抢救/, skill: '急救', score: 80, reason: '实施紧急救治' },
    { pattern: /诊断|化验|解剖|中毒|药剂|粉末|医学检查/, skill: '医学', score: 76, reason: '判断医学或药物线索' },
    { pattern: /威胁|恐吓|逼问/, skill: '恐吓', score: 72, reason: '迫使对方提供信息' },
    { pattern: /说服|劝说|谈判|请求/, skill: '说服', score: 70, reason: '改变对方的态度' },
    { pattern: /套话|撒谎|骗|假装|攀谈/, skill: '话术', score: 68, reason: '从交谈中取得进展' },
    { pattern: /查阅|档案|文献|图书馆|翻书/, skill: '图书馆', score: 62, reason: '从资料中定位可靠信息' },
    { pattern: /观察[^，。；！？\n]{0,16}(?:表情|神色|脸色|肢体|反应)|判断[^，。；！？\n]{0,12}(?:真假|说谎|隐瞒)|是否说谎|心理/, skill: '心理学', score: 60, reason: '判断对方的真实反应' },
    { pattern: /聆听|倾听|偷听|听清|门外动静/, skill: '聆听', score: 56, reason: '分辨不易察觉的声音' },
    { pattern: /搜查|搜索|搜寻|检查|观察|查看|侦查/, skill: '侦查', score: 52, reason: '发现不明显的线索' }
  ];

  const spec = specs.find((item) => hasAffirmativeMatch(text, item.pattern));
  if (!spec) return null;
  return {
    score: spec.score - (describesAssistingAnother ? 50 : 0),
    check: {
      player: action.player,
      skill: spec.skill,
      difficulty: spec.difficulty ?? '普通',
      reason: spec.reason
    }
  };
}

function actorHasHandgun(state: GameState, playerName: string): boolean {
  return state.players.find((player) => player.name === playerName)?.equipment
    ?.some((item) => /手枪|左轮枪/.test(item)) ?? false;
}

/** Picks at most one check because the current UI can settle one pending check at a time. */
export function buildRequiredCheck(actions: PlayerAction[], state: GameState): CheckRequest | null {
  if (actions.some((action) => DICE_RESULT_RE.test(action.action))) return null;
  const progress = getScenarioProgressForState(state);
  if (state.currentScene === 'S05'
    && progress.variables.finaleRoute === 'combat'
    && progress.encounters.ENC01?.state === 'active'
    && !actions.some((action) => hasAffirmativeMatch(action.action, COMBAT_ACTION_RE))) {
    return null;
  }
  const kb = getActiveKnowledgeBase();
  const targetedItems = explicitlyTargetedScenarioItemActions(actions, state, kb);
  if (targetedItems.length) {
    const authoredCheck = targetedItems.find(({ item }) => item.discovery.difficulty !== '自动');
    if (!authoredCheck) return null;
    return {
      player: authoredCheck.action.player,
      skill: authoredCheck.item.discovery.skill,
      difficulty: authoredCheck.item.discovery.difficulty as CheckRequest['difficulty'],
      reason: `调查作者线索 ${authoredCheck.item.name}`
    };
  }
  const storyCall = inferStoryEventFromActions(actions, state);
  let authoredEvent: ReturnType<typeof getAvailableStoryEvents>[number] | undefined;
  if (storyCall) {
    const eventId = String(storyCall.arguments.eventId ?? '');
    authoredEvent = getAvailableStoryEvents(
      getScenarioProgressForState(state),
      state.currentScene
    ).find((candidate) => candidate.id === eventId);
  }
  const sceneChange = inferSceneChangeFromActions(actions, state, kb);
  const targetScene = sceneChange
    ? String(sceneChange.arguments.targetSceneId) as SceneId
    : state.currentScene;
  const candidates = actions
    .map((action) => {
      if (!actionExplicitlyMovesToReachableScene(action, state)) return buildCandidate(action);
      if (!sceneChange) return null;
      const followUp = actionAfterSceneDestination(action, targetScene, kb);
      return followUp ? buildCandidate({ ...action, action: followUp }) : null;
    })
    .filter((item): item is CheckCandidate => Boolean(item))
    .sort((a, b) => b.score - a.score);
  // Most authored events own their complete resolution and must not acquire a
  // second generic gate. Montreal is intentionally different: a companion's
  // explicit behavioral read is a hard Psychology check before the meeting
  // event settles, while ordinary questioning still resolves without a roll.
  if (authoredEvent
    && !(authoredEvent.id === 'EV_MEET_MONTREAL'
      && candidates.some((candidate) => candidate.check.skill === '心理学'))) return null;
  for (const candidate of candidates) {
    const player = state.players.find((item) => item.name === candidate.check.player);
    if (!player) continue;
    if (candidate.check.skill === '射击（手枪）' && !actorHasHandgun(state, player.name)) continue;
    if (!player.skills[candidate.check.skill]) {
      const fallback = candidate.check.skill === '机械维修' ? '侦查' : null;
      if (!fallback || !player.skills[fallback]) continue;
      return { ...candidate.check, skill: fallback };
    }
    return applyAuthoredCheckDifficulty(candidate.check, targetScene);
  }
  return null;
}

const AUTHORED_ITEM_SEARCH_RE = /搜查|搜索|搜寻|寻找|检查|观察|查看|侦查|翻找|调查|辨认|比对|分析/;

function actionAffirmativelyTargetsTerms(text: string, terms: string[]): boolean {
  return text.split(/[，。；！？\n]+/).some((clause) =>
    clause
    && !onlyRequestsPermissionToInvestigate(clause)
    && hasAffirmativeMatch(clause, AUTHORED_ITEM_SEARCH_RE)
    && terms.some((term) => term && clause.includes(term))
  );
}

function explicitlyTargetedScenarioItemActions(
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase
) {
  const definition = getScenarioDefinition();
  const discovered = new Set(state.clues.map((clue) => clue.id));
  return definition.world.items.flatMap((item) => {
    if (item.sceneId !== state.currentScene || discovered.has(item.id)) return [];
    const action = actions.find((candidate) => {
      if (DICE_RESULT_RE.test(candidate.action)) return false;
      return actionAffirmativelyTargetsTerms(candidate.action, [
        item.name,
        ...(kb.items[item.id]?.public.aliases ?? []),
        ...item.discovery.searchTerms
      ]);
    });
    return action ? [{ action, item }] : [];
  });
}

function explicitlyTargetedScenarioItems(
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase
) {
  const seen = new Set<string>();
  return explicitlyTargetedScenarioItemActions(actions, state, kb)
    .map(({ item }) => item)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

/**
 * Converts explicit authored clue searches into one or more Director-reviewed
 * events. On a failed roll the event id comes from the item's YAML-defined
 * failure path, so minimum information and costs remain scenario-authoritative.
 */
export function inferStoryEventsFromActions(
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase = getActiveKnowledgeBase()
): DmToolCall[] {
  const available = new Set(
    getAvailableStoryEvents(getScenarioProgressForState(state), state.currentScene).map((event) => event.id)
  );
  const failed = actionIsFailedCheck(actions);
  const clueCalls = explicitlyTargetedScenarioItems(actions, state, kb).flatMap((item) => {
    const eventId = failed ? item.discovery.failureEventId : item.discovery.successEventId;
    return available.has(eventId) ? [{
      name: 'propose_story_event' as const,
      arguments: {
        eventId,
        reason: failed
          ? `检定失败，按 ${item.id} 的作者失败推进结算`
          : `玩家明确调查作者线索 ${item.id}`
      }
    }] : [];
  });
  if (clueCalls.length) return clueCalls;
  const legacy = inferStoryEventFromActions(actions, state);
  return legacy ? [legacy] : [];
}

/** Returns the player whose own action proposed a structured story event. */
export function inferStoryEventActor(
  actions: PlayerAction[],
  state: GameState,
  eventId: string,
  kb: KnowledgeBase = getActiveKnowledgeBase()
): string | null {
  if (eventId === 'EV_CHOOSE_COMBAT' || eventId === 'EV_COMBAT_ATTACK') {
    const combatActors = actions
      .map((action, index) => ({
        action,
        index,
        score: combatActorScore(action, actions, state)
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    if (combatActors.length) return combatActors[0].action.player;
  }
  return actions.find((action) => inferStoryEventsFromActions([action], state, kb)
    .some((call) => call.arguments.eventId === eventId))?.player ?? null;
}

export function combatCheckSkillForActor(
  actions: PlayerAction[],
  state: GameState,
  actorName: string
): string {
  const action = actions.find((candidate) => candidate.player === actorName)?.action ?? '';
  const actor = state.players.find((candidate) => candidate.name === actorName);
  if (!actionUsesHandgun(action)) return '格斗（拳）';
  const hasHandgun = actor?.equipment?.some((item) => /手枪|左轮枪/.test(item)) ?? false;
  return hasHandgun && Boolean(actor?.skills['射击（手枪）'])
    ? '射击（手枪）'
    : '格斗（拳）';
}

function actionUsesHandgun(text: string): boolean {
  return /(?:开枪|射击|枪击|扣(?:下)?扳机)|(?:使用|用|举起|拔出|抽出|掏出|握住)[^，。；！？\n]{0,12}(?:手枪|左轮枪)[^，。；！？\n]{0,12}(?:攻击|开火|射击|枪击|击发)/.test(text);
}

function combatActorScore(action: PlayerAction, actions: PlayerAction[], state: GameState): number {
  const text = action.action;
  if (!hasAffirmativeMatch(text, COMBAT_ACTION_RE)) return 0;
  if (actionUsesHandgun(text) && !actorHasHandgun(state, action.player)) return 0;
  let score = 10;
  const namesAnotherAttacker = actions.some((other) => {
    if (other.player === action.player || !text.includes(other.player)) return false;
    return new RegExp(`${escapeRegex(other.player)}[^，。；！？\\n]{0,18}(?:${COMBAT_ACTION_RE.source})`).test(text);
  });
  if (namesAnotherAttacker) score -= 20;
  if (/(?:用|挥动|挥起|挥出|抽出|拔出|举起|抡起)[^，。；！？\n]{0,16}(?:警棍|拳|枪|武器|刀)|(?:向|对)[^，。；！？\n]{0,18}(?:深潜者|敌人|守卫)[^，。；！？\n]{0,12}(?:攻击|打倒|击打|挥击|横扫|猛击|射击)/.test(text)) {
    score += 30;
  }
  if (/(?:掩护|协助|配合|牵制|警戒|观察|照明)[^，。；！？\n]{0,18}(?:同伴|队友|他|她|[\u4e00-\u9fff·]{2,10})[^，。；！？\n]{0,12}(?:攻击|击打|挥击|横扫)/.test(text)) {
    score -= 10;
  }
  return score;
}

function applyAuthoredCheckDifficulty(check: CheckRequest, sceneId: SceneId): CheckRequest {
  if (sceneId === 'S02' && check.skill === '心理学') {
    return { ...check, difficulty: '困难' };
  }
  return check;
}

function sceneTerms(kb: KnowledgeBase, sceneId: SceneId): string[] {
  const scene = kb.scenes[sceneId]?.public;
  return scene ? [scene.id, scene.name, ...(scene.aliases ?? [])] : [];
}

function explicitlyTravelsToScene(text: string, kb: KnowledgeBase, sceneId: SceneId): boolean {
  return sceneTerms(kb, sceneId).some((term) => {
    if (!term || term.length < 2) return false;
    return new RegExp(
      `(?:前往|返回|回到|赶往|抵达|到达|来到|进入|登上|去往)[^。；！？\\n]{0,16}${escapeRegex(term)}`,
      'i'
    ).test(text);
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function framesForeignSceneAsCurrent(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    if (!term || term.length < 2) return false;
    const escaped = escapeRegex(term);
    return new RegExp(
      `(?:仍在|正在|身处|留在|待在|站在|坐在|回到|进入|走进|来到|抵达|到达|赶到)[^。；！？\\n]{0,12}${escaped}`
      + `|${escaped}(?:里|内|内部|中|外|门口|门廊|大厅|办公室|吧台|柜台|后厅)[^。；！？\\n]{0,24}(?:仍|正|有|坐|站|走|聚|传来|响起|闲聊|说话|货架|玻璃|碎片|脚印|报纸|弥漫|散落|倾倒|堆着|摆着|漆黑|昏暗)`,
      'i'
    ).test(text);
  });
}

function deniesArrivalAtScene(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    if (!term || term.length < 2) return false;
    const escaped = escapeRegex(term);
    return new RegExp(
      `(?:尚未|还未|仍未|没有|并未|未能)[^。；！？\\n]{0,16}(?:抵达|到达|进入|来到|赶到|登上)[^。；！？\\n]{0,12}${escaped}`
      + `|(?:尚未|还未|仍未|没有|并未|未能)[^。；！？\\n]{0,16}${escaped}`,
      'i'
    ).test(text);
  });
}

function sceneNpcTerms(kb: KnowledgeBase, sceneId: SceneId): string[] {
  return (kb.scenes[sceneId]?.public.npcs ?? []).flatMap((name) => {
    const npc = kb.npcs[name]?.public;
    return npc ? [npc.name, npc.role, ...(npc.aliases ?? [])] : [name];
  });
}

function unavailableNpcRole(text: string, kb: KnowledgeBase, sceneId: SceneId, directInteraction = false) {
  const availableTerms = sceneNpcTerms(kb, sceneId);
  return NPC_ROLE_TERMS.find((term) => {
    if (availableTerms.some((candidate) => candidate.includes(term))) return false;
    if (directInteraction) {
      return new RegExp(`(?:问|询问|追问|向|与|说服|观察|拜访|跟随)(?:眼前的|这位|附近的)?${term}`).test(text);
    }
    return new RegExp(`${term}[^。！？\\n]{0,10}(?:说|回答|问|告诉|表示|回忆|想了想|开口|承认|点头|摇头)[^。！？\\n]{0,3}[：:“\"]`).test(text);
  }) ?? null;
}

function explicitlyRequestsMove(text: string) {
  if (
    /(?:本轮|这轮|现在|目前|暂时)[^，。；！？\n]{0,12}(?:不动身|不出发|不离开|不前往|不去)/.test(text)
    || /(?:留在|待在|停留在)[^，。；！？\n]{0,32}(?:只讨论|不动身|不出发|不离开|不前往|不去)/.test(text)
  ) return false;
  if (movementIsOnlyDiscussed(text)) return false;
  if (MOVE_VERB_RE.test(text)) return true;
  if (!/去/.test(text)) return false;
  return !/(?:不|别|不要|暂不|要不要|是否|考虑是否)[^，。；！？\n]{0,4}去/.test(text);
}

function movementIsOnlyDiscussed(text: string): boolean {
  return /(?:提醒|建议|询问|商量|考虑|计划|打算|准备|讨论|提议)[^，。；！？\n]{0,18}(?:前往|赶往|去往|出发|动身|返回|离开|抵达|到达)/.test(text);
}

function sceneMentionFollowsDestinationVerb(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    if (!term) return false;
    const index = text.indexOf(term);
    if (index < 0) return false;
    const prefix = text.slice(Math.max(0, index - 24), index);
    const destinationVerbs = [...prefix.matchAll(new RegExp(MOVE_DESTINATION_RE.source, 'g'))];
    const lastDestinationVerb = destinationVerbs[destinationVerbs.length - 1];
    const suffix = text.slice(index + term.length, index + term.length + 24);
    const destinationFollowsScene = /^(?:[^，。；！？\n]{0,10})?(?:便|就|则)?(?:从[^，。；！？\n]{0,8})?(?:进入|走进|抵达|到达|来到|登上)/.test(suffix)
      && !/^(?:[^，。；！？\n]{0,10})?(?:不|别|勿|不要|并不|无需)/.test(suffix);
    if (!lastDestinationVerb) return destinationFollowsScene;

    const verbIndex = lastDestinationVerb.index ?? 0;
    const beforeVerb = prefix.slice(Math.max(0, verbIndex - 8), verbIndex);
    const between = prefix.slice(verbIndex + lastDestinationVerb[0].length);
    const negated = /(?:暂(?:时|且)?|先|明确)?(?:不|别|勿|不要|并不|无需)(?:再)?$/.test(beforeVerb);
    const attributiveGo = lastDestinationVerb[0] === '去'
      && (/(?:常|曾|会|想|要|能|可|失|过)$/.test(beforeVerb) || /^的/.test(between));
    return destinationFollowsScene || (!negated
      && !attributiveGo
      && !/[，。；！？\n]/.test(between)
      && lastDestinationVerb[0] !== '离开');
  });
}

function actionAfterSceneDestination(
  action: PlayerAction,
  targetScene: SceneId,
  kb: KnowledgeBase
): string {
  let destinationEnd = -1;
  for (const term of sceneTerms(kb, targetScene)) {
    const index = action.action.lastIndexOf(term);
    if (index >= 0) destinationEnd = Math.max(destinationEnd, index + term.length);
  }
  return destinationEnd >= 0 ? action.action.slice(destinationEnd) : '';
}

export function buildPostMoveContinuationActions(
  actions: PlayerAction[],
  state: GameState,
  targetScene: SceneId,
  kb: KnowledgeBase = getActiveKnowledgeBase()
): PlayerAction[] {
  return actions.flatMap((action) => {
    if (!actionExplicitlyMovesToReachableScene(action, state)) return [action];
    const followUp = actionAfterSceneDestination(action, targetScene, kb)
      .replace(/^[，。；！？\s]+/, '')
      .trim();
    return followUp ? [{ ...action, action: followUp }] : [];
  });
}

function actionExplicitlyMovesToReachableScene(action: PlayerAction, state: GameState): boolean {
  if (!explicitlyRequestsMove(action.action)) return false;
  const kb = getActiveKnowledgeBase();
  return getAvailableSceneExits(getScenarioProgressForState(state), state.currentScene)
    .some((exit) => sceneMentionFollowsDestinationVerb(action.action, sceneTerms(kb, exit.sceneId)));
}

export function inferSceneChangeFromActions(
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase
): DmToolCall | null {
  const reachable = getAvailableSceneExits(
    getScenarioProgressForState(state),
    state.currentScene
  ).map((exit) => exit.sceneId);
  for (const action of actions) {
    const target = reachable.find((sceneId) =>
      sceneMentionFollowsDestinationVerb(action.action, sceneTerms(kb, sceneId))
    );
    if (target && explicitlyRequestsMove(action.action)) {
      return {
        name: 'propose_scene_change',
        arguments: {
          targetSceneId: target,
          reason: `${action.player}明确声明前往${kb.scenes[target].public.name}`
        }
      };
    }
  }
  return null;
}

export function inferStoryEventFromActions(
  actions: PlayerAction[],
  state: GameState
): DmToolCall | null {
  const text = actions.map((action) => action.action).join('\n');
  const available = new Set(
    getAvailableStoryEvents(getScenarioProgressForState(state), state.currentScene).map((event) => event.id)
  );
  const mappings: Array<[string, RegExp]> = [
    ['EV_ACCEPT_COMMISSION', /接受.{0,8}委托|确认.{0,8}委托/],
    [
      'EV_FIND_I04',
      /加热|烘烤|显字|破译|(?:解读|复核|复查|确认).{0,12}(?:小册子|隐写)|(?:小册子|隐写).{0,24}(?:解读|解码|复核|复查|确认)/
    ],
    [
      'EV_BARTENDER_RAT',
      /酒保[\s\S]{0,20}(?:老鼠|贝尔街)|(?:老鼠|贝尔街)[\s\S]{0,20}酒保|(?:金钱|银币|小费|报酬|贿赂)[^。；！？\n]{0,20}(?:换取|打听|询问|消息|信息|开口)|(?:说明|解释)[^。；！？\n]{0,24}(?:受托|寻找|失踪|埃里克)/
    ],
    ['EV_S04_CIGAR', /雪茄/],
    [
      'EV_CHOOSE_NEGOTIATION',
      /选择.{0,8}交涉|和平交涉|愿意.{0,8}交涉|尝试.{0,8}交涉|暂缓攻击|不(?:发动|使用|采取).{0,6}(?:攻击|武力)|(?:放下|放低|收起|垂下).{0,6}(?:武器|枪|警棍)|(?:武器|枪|警棍).{0,6}(?:收起|放下|放低)/
    ],
    [
      'EV_NEGOTIATION_LISTEN',
      /(?:聆听|倾听).{0,16}诉求|理解.{0,12}诉求|(?:提出|确认|完成).{0,12}(?:交换|条件)|说服.{0,12}(?:释放|放走).{0,8}埃里克|不碰.{0,8}货物.{0,16}(?:释放|放走)/
    ],
    ['EV_CHOOSE_COMBAT', COMBAT_ACTION_RE],
    ['EV_COMBAT_ATTACK', COMBAT_ACTION_RE]
  ];
  const match = mappings.find(([eventId, pattern]) => {
    if (!available.has(eventId)) return false;
    const matchesAction = actions.some((action) =>
      !DICE_RESULT_RE.test(action.action)
      && hasAffirmativeMatch(action.action, pattern)
      && (eventId !== 'EV_COMBAT_ATTACK' && eventId !== 'EV_CHOOSE_COMBAT'
        || !actionUsesHandgun(action.action)
        || actorHasHandgun(state, action.player))
    );
    return matchesAction && (!actionIsFailedCheck(actions) || eventId === 'EV_BARTENDER_RAT');
  });
  if (available.has('EV_MEET_MONTREAL') && matchesMontrealMeetingEvent(actions, text)) {
    return {
      name: 'propose_story_event',
      arguments: { eventId: 'EV_MEET_MONTREAL', reason: '玩家已实际质询蒙特利尔或完成会面收尾' }
    };
  }
  return match ? {
    name: 'propose_story_event',
    arguments: { eventId: match[0], reason: '玩家行动明确满足作者事件意图' }
  } : null;
}

function matchesMontrealMeetingEvent(actions: PlayerAction[], text: string): boolean {
  if (!/蒙特利尔/.test(text)) return false;

  const discussesCase = /(?:质询|询问|追问|提问|请|要求|出示|递给|交给)[\s\S]{0,80}蒙特利尔[\s\S]{0,80}(?:埃里克|合影|照片|关系)/.test(text)
    || /蒙特利尔[\s\S]{0,80}(?:埃里克|合影|照片|关系)[\s\S]{0,40}(?:质询|询问|追问|提问|回答|说明|辨认)/.test(text);
  const closesMeeting = /蒙特利尔[\s\S]{0,60}(?:拒绝|拒答|回避|最后答复|离场|离开)[\s\S]{0,60}(?:记录|结束会面|不再纠缠|离开警察局|离开分局)/.test(text)
    || /(?:记录|确认)[\s\S]{0,40}蒙特利尔[\s\S]{0,40}(?:拒绝|拒答|回避|离场|最后答复)/.test(text);
  const settlesObservation = actions.some((action) => DICE_RESULT_RE.test(action.action))
    && /(?:观察|反应|表情|眼神|停顿|手部动作)[\s\S]{0,80}蒙特利尔|蒙特利尔[\s\S]{0,80}(?:观察|反应|表情|眼神|停顿|手部动作)/.test(text);

  return discussesCase || closesMeeting || settlesObservation;
}

function actionIsFailedCheck(actions: PlayerAction[]): boolean {
  return actions.some((action) => /【检定结果】[\s\S]*结果[：:]\s*(?:失败|大失败)/.test(action.action));
}

export function inferDiscoveredItems(
  narrative: string,
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase,
  sceneId: SceneId
): string[] {
  if (actionIsFailedCheck(actions)) return [];
  const found = new Set(state.clues.map((clue) => clue.id));
  const out: string[] = [];
  for (const [id, entry] of Object.entries(kb.items)) {
    if (found.has(id) || entry.public.scene !== sceneId) continue;
    const terms = [entry.public.name, ...(entry.public.aliases ?? [])].filter(Boolean);
    const match = terms.find((term) => narrative.includes(term));
    if (!match) continue;
    const index = narrative.indexOf(match);
    const context = index >= 0
      ? narrative.slice(Math.max(0, index - 14), index + match.length)
      : '';
    const item = escapeRegex(match);
    const discoveryDenied = new RegExp(
      `(?:没有|未能|没能|并未)[^，。；！？\\n]{0,6}(?:发现|找到|取得|获得|拿到|看见|看到|辨认)[^，。；！？\\n]{0,3}${item}`
      + `|(?:找不到|未发现|并无)[^，。；！？\\n]{0,3}${item}`
    ).test(context);
    if (discoveryDenied) continue;
    out.push(id);
  }
  return out;
}

function mergeDelta(target: Record<string, number>, player: string, delta: number): void {
  target[player] = (target[player] ?? 0) + delta;
}

function narrativeHarmsPlayer(narrative: string, playerName: string): boolean {
  const player = escapeRegex(playerName);
  const text = narrative.replace(new RegExp(
    `${player}[^，。；！？\\n]{0,8}(?:没有|并未|未曾|未)(?:受到|遭受)?[^，。；！？\\n]{0,4}(?:受伤|流血|渗血|出血|骨折|伤口|血痕|剧痛)[^，。；！？\\n]*`,
    'g'
  ), '');
  const bodyPart = '(?:头|脸|颈|肩|胸|背|腰|腹|手|手臂|前臂|小臂|手掌|手指|指尖|虎口|腿|膝|脚|皮肤)';
  const injury = '(?:击中|打中|砸中|撞上|划伤|抓伤|刺伤|咬伤|撕伤|撕裂|砍伤|中弹|受伤|流血|渗血|出血|鲜血|骨折|伤口|旧伤|血口|血痕|血丝|剧痛|划出.{0,6}(?:伤口|血口|血痕|细痕))';
  const direct = new RegExp(
    `${player}(?:的?${bodyPart})?(?:被|受到|遭到|挨(?:了)?|中(?:了)?)[^，。；！？\\n]{0,18}${injury}`
    + `|${player}(?:的?${bodyPart})?[^，。；！？\\n]{0,16}(?:受伤|流血|渗血|出血|鲜血|骨折|出现.{0,4}(?:伤口|血口|血痕)|传来.{0,4}剧痛|旧伤[^，。；！？\\n]{0,8}(?:撕裂|更深|加重)|伤口[^，。；！？\\n]{0,8}(?:撕裂|更大|更深|加重))`
  );
  const struckBodyPart = new RegExp(
    `(?:击中|打中|砸中|撞上|划过|划伤|抓向|抓伤|刺伤|咬伤|撕伤|撕裂|砍伤)[^，。；！？\\n]{0,16}${player}的?${bodyPart}`
  );
  const pronounInjury = new RegExp(
    `${player}[^。；！？\\n]{0,100}(?:他的|其)${bodyPart}[^。；！？\\n]{0,28}${injury}`
  );
  return direct.test(text) || struckBodyPart.test(text) || pronounInjury.test(text);
}

function textSimilarity(left: string, right: string): number {
  const normalize = (value: string) => value.replace(/[\s，。！？、；：“”‘’（）—…,.!?;:'"()-]/g, '');
  const a = normalize(left);
  const b = normalize(right);
  if (a.length < 30 || b.length < 30) return 0;
  const grams = (value: string) => new Set(
    Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
  );
  const aSet = grams(a);
  const bSet = grams(b);
  const overlap = [...aSet].filter((item) => bSet.has(item)).length;
  return overlap / Math.max(1, new Set([...aSet, ...bSet]).size);
}

/** Fallback only: explicit model state tools remain authoritative when present. */
export function inferNarrativeConsequences(
  response: AiResponse,
  actions: PlayerAction[],
  state: GameState
): AiResponse {
  const narrative = response.narrative ?? '';
  const hp = { ...(response.stateUpdate?.hp ?? {}) };
  const involved = new Set(actions.map((action) => action.player));

  const harmPattern = /中弹|被[^，。；！？\n]{0,12}击中|受伤|流血|渗血|出血|血口|血痕|血丝|灼伤|划伤|划过|抓伤|刺伤|咬伤|撕伤|划出(?:一道)?(?:伤口|血痕|细痕)|骨折|剧痛/;
  if (harmPattern.test(narrative)) {
    const harmClauses = narrative
      .split(/[，。；！？\n]/)
      .filter((clause) => harmPattern.test(clause));
    const namedVictims = state.players.filter((player) =>
      narrativeHarmsPlayer(narrative, player.name)
    );
    const explicitlyTargetsInvestigator = harmClauses.some((clause) =>
      /(?:调查员|玩家角色|你(?:被|的|受到)|你们(?:被|受到))/.test(clause)
    );
    const involvedPlayers = state.players.filter((player) => involved.has(player.name));
    const victims = namedVictims.length
      ? namedVictims
      : explicitlyTargetsInvestigator && involvedPlayers.length === 1
        ? involvedPlayers
        : [];
    for (const player of victims) {
      if (hp[player.name] === undefined) mergeDelta(hp, player.name, -1);
    }
  }
  return {
    ...response,
    stateUpdate: {
      ...response.stateUpdate,
      hp
    }
  };
}

export function sanitizePlayerChoices(
  choices: Record<string, string[]>,
  discoveredIds: ReadonlySet<string>,
  kb: KnowledgeBase,
  sceneId?: SceneId,
  finaleRoute?: unknown,
  remainingOpponents = 4,
  players: GameState['players'] = []
): Record<string, string[]> {
  const hiddenTerms = Object.entries(kb.items)
    .filter(([id]) => !discoveredIds.has(id))
    .flatMap(([, entry]) => [entry.public.name, ...(entry.public.aliases ?? [])])
    .filter((term) => term.length >= 2);
  const finaleFallback = sceneId === 'S05'
    ? buildFinaleSuggestions(
        players.length
          ? players
          : Object.keys(choices).map((name) => ({ id: name, name, equipment: ['随身武器'] })) as GameState['players'],
        finaleRoute,
        remainingOpponents
      )
    : {};
  const fallback = ['继续观察当前环境', '与在场人物核对已知事实', '整理已经发现的线索'];
  const offstageNpcNames = sceneId
    ? Object.keys(kb.npcs).filter((name) => !kb.scenes[sceneId]?.public.npcs.includes(name))
    : [];
  const entries: Array<[string, string[]]> = players.length
    ? players.map((player) => [player.name, choices[player.name] ?? choices[player.id] ?? []])
    : Object.entries(choices);
  return Object.fromEntries(entries.map(([player, list]) => {
    const playerState = players.find((candidate) => candidate.name === player);
    const canAttack = playerState
      ? (playerState.equipment ?? []).some((item) => /手枪|左轮枪|警棍|棍|刀|武器/.test(item))
      : null;
    const safe = list.filter((choice) =>
      !hiddenTerms.some((term) => choice.includes(term))
      && !offstageNpcNames.some((name) => choice.includes(name))
      && !(sceneId && unavailableNpcRole(choice, kb, sceneId, true))
      && !(sceneId && explicitlyTravelsToScene(choice, kb, sceneId))
      && !(sceneId === 'S05'
        && !isFinaleChoiceCompatible(choice, finaleRoute, remainingOpponents, canAttack))
    );
    const playerFallback = sceneId === 'S05'
      ? finaleFallback[players.find((candidate) => candidate.name === player)?.id ?? player] ?? fallback
      : fallback;
    for (const item of playerFallback) {
      if (safe.length >= 3) break;
      if (!safe.includes(item)) safe.push(item);
    }
    return [player, safe.slice(0, 3)];
  }));
}

interface AddressReference {
  key: string;
  text: string;
}

function extractAddressReferences(text: string): AddressReference[] {
  const pattern = /(?:^|[\s，。；！？：“”‘’在往向至到从于着是])([\u4e00-\u9fff]{1,8}?(?:上街|下街|大街|大道|街|巷|路))\s*(\d{1,4})(?:\s*[-至到]\s*(\d{1,4}))?\s*号?/g;
  const out: AddressReference[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ key: `${match[1]}${match[2]}号`, text: match[0].trim() });
    if (match[3]) out.push({ key: `${match[1]}${match[3]}号`, text: match[0].trim() });
  }
  return out;
}

function publicScenarioCorpus(kb: KnowledgeBase): string {
  const scenes = Object.values(kb.scenes).flatMap(({ public: scene }) => [
    scene.name,
    scene.desc,
    ...(scene.aliases ?? [])
  ]);
  const npcs = Object.values(kb.npcs).flatMap(({ public: npc }) => [
    npc.name,
    npc.role,
    npc.appearance,
    ...(npc.aliases ?? [])
  ]);
  const items = Object.values(kb.items).flatMap(({ public: item }) => [
    item.name,
    item.appearance,
    ...(item.aliases ?? [])
  ]);
  return [...scenes, ...npcs, ...items].join('\n');
}

function lockedSceneReference(
  text: string,
  authority: string,
  state: GameState,
  kb: KnowledgeBase,
  proposedEvents: ReturnType<typeof getAvailableStoryEvents>
): string | null {
  const progress = getScenarioProgressForState(state);
  const projected = processScenarioTurn(progress, {
    currentScene: state.currentScene,
    storyEventIds: proposedEvents.map((event) => event.id),
    turn: getDmRequestTurn(state.conversationHistory),
    completeTurn: false
  }).progress;
  const visibleSceneIds = new Set([
    state.currentScene,
    ...projected.visitedSceneIds,
    ...getAvailableSceneExits(projected, state.currentScene).map((exit) => exit.sceneId)
  ]);

  for (const [sceneId, entry] of Object.entries(kb.scenes) as Array<[SceneId, KnowledgeBase['scenes'][SceneId]]>) {
    if (visibleSceneIds.has(sceneId)) continue;
    const distinctiveTerms = [entry.public.name, ...(entry.public.aliases ?? [])]
      .map((term) => term.trim())
      .filter((term) => {
        const length = term.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').length;
        return length >= 4 || (length >= 3 && term.endsWith('区'));
      });
    const leaked = distinctiveTerms.find((term) => text.includes(term) && !authority.includes(term));
    if (leaked) return leaked;
  }
  return null;
}

const NPC_APPEARANCE_CONFLICTS: Array<{ authored: RegExp; contradictedBy: RegExp }> = [
  { authored: /壮实|魁梧|健壮|结实|矮胖|肥胖|发福|臃肿/, contradictedBy: /清瘦|精瘦|瘦削|消瘦|干瘦|单薄/ },
  { authored: /清瘦|精瘦|瘦削|消瘦|干瘦|单薄/, contradictedBy: /壮实|魁梧|健壮|结实|矮胖|肥胖|发福|臃肿/ },
  {
    authored: /刮得干净|没有胡须|无胡须/,
    contradictedBy: /络腮胡|大胡子|浓密胡须|胡子拉碴|乱糟糟(?:的)?胡子|留着[^。；，]{0,8}胡须|摸了摸[^。；，]{0,6}(?:胡须|胡子)/
  },
  { authored: /二十余岁|年轻/, contradictedBy: /中年|老年|年迈|白发苍苍/ },
  { authored: /中年|四十|五十/, contradictedBy: /少年|十几岁|二十余岁/ }
];

function activeNpcAppearanceConflict(
  narrative: string,
  activeNpcName: string | null | undefined,
  sceneId: SceneId,
  kb: KnowledgeBase
): string | null {
  if (!activeNpcName) return null;
  const npc = kb.npcs[activeNpcName]?.public;
  if (!npc) return null;
  const sceneNpcNames = kb.scenes[sceneId]?.public.npcs ?? [];
  const terms = [npc.name, npc.role, ...(npc.aliases ?? [])].filter((term) => term.length >= 2);
  const refersToActiveNpc = sceneNpcNames.length === 1 || terms.some((term) => narrative.includes(term));
  if (!refersToActiveNpc) return null;
  const conflict = NPC_APPEARANCE_CONFLICTS.find(({ authored, contradictedBy }) =>
    authored.test(npc.appearance) && contradictedBy.test(narrative)
  );
  return conflict ? npc.name : null;
}

function eventAuthorizesOutcome(
  event: ReturnType<typeof getAvailableStoryEvents>[number],
  outcome: 'rescue' | 'ending'
): boolean {
  return event.effects.some((effect) => {
    if (outcome === 'ending') return 'setEnding' in effect;
    return ('setVariable' in effect && effect.setVariable === 'ericRescued' && effect.value === true)
      || 'setEnding' in effect;
  });
}

const PLOT_CLAIM_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: '报案日期或受理流程',
    pattern: /(?:报案|受理|笔录|接待警员)[^。；！？\n]{0,48}(?:7月11日|11号|第二天|次日|早晨|一早|做了?笔录|登记)/
  },
  {
    label: '家庭争执或财务背景',
    pattern: /(?:伊莎贝拉|埃里克|父亲|父女|我们)[^。；！？\n]{0,56}(?:大吵|争吵|吵架|因为.{0,12}(?:花钱|欠债|债务)|(?:存在|有|背负|隐瞒|欠下).{0,8}(?:欠债|债务)|财务困难|手头紧|经济纠纷|金钱纠纷|债务纠纷)/
  },
  {
    label: '未解锁的人物关系',
    pattern: /(?:蒙特利尔[^。；！？\n]{0,48}(?:认识|熟悉|朋友|旧识|关照|与埃里克[^。；！？\n]{0,12}(?:关系|同框))|(?:埃里克|父亲)[^。；！？\n]{0,40}蒙特利尔[^。；！？\n]{0,16}(?:认识|熟悉|朋友|旧识|关照))/
  },
  {
    label: '失踪前的未授权行踪细节',
    pattern: /(?:埃里克|父亲)[^。；！？\n]{0,56}(?:傍晚|晚上)[^。；！？\n]{0,20}(?:离开|出门)|(?:埃里克|父亲)[^。；！？\n]{0,48}(?:去|前往|到)[^。；！？\n]{0,12}(?:码头区|码头|港口)|(?:失踪当天|失踪当日|7月10日|那天早上)[^。；！？\n]{0,48}(?:去|前往|到)[^。；！？\n]{0,12}老赫特|(?:去|前往)[^。；！？\n]{0,12}老赫特[^。；！？\n]{0,24}(?:见|会面)[^。；！？\n]{0,8}(?:朋友|生意伙伴)/
  },
  {
    label: '未解锁人物介入调查',
    pattern: /蒙特利尔[^。；！？\n]{0,56}(?:(?:亲自|表示|说|承诺|答应|保证)[^。；！？\n]{0,20}(?:会调查|负责调查|关照|接手|处理)|(?:接手|负责|受理|处理)[^。；！？\n]{0,12}(?:案子|案件|调查)|(?:已经|曾经|早已)?(?:派人)?调查(?:过|了)?[^。；！？\n]{0,20}(?:没有|未|没)[^。；！？\n]{0,10}(?:发现|结果|进展|可疑))|(?:失踪案|案件)[^。；！？\n]{0,32}(?:已经|曾经|早已)(?:派人)?调查(?:过|了)/
  },
  {
    label: '人物身份或背景',
    pattern: /(?:老鼠|埃里克|蒙特利尔|那人)[^。；！？\n]{0,40}(?:东欧口音|瘦子|瘦小|驼背|软帽|走私者|帮派成员|船员|水手|毒贩)/
  },
  {
    label: '未授权的目击时间或行踪',
    pattern: /(?:最后一次|上次)[^。；！？\n]{0,28}(?:来|出现|见到)[^。；！？\n]{0,28}(?:周[一二三四五六日天]|星期[一二三四五六日天]|十天前)|(?:周[一二三四五六日天]|星期[一二三四五六日天]|十天前)[^。；！？\n]{0,36}(?:最后一次|来过|出现|见到)|(?:老鼠|那人)[^。；！？\n]{0,36}(?:总在|常在|经常在)[^。；！？\n]{0,12}(?:码头|港口)/
  },
  {
    label: '犯罪、交易或胁迫关系',
    pattern: /(?:老鼠|埃里克|蒙特利尔)[^。；！？\n]{0,40}(?:运过.{0,6}货|运输|走私|贩卖|交易|生意往来|同伙|绑架|雇佣|指使|收买|勾连|翻脸|不肯放手|不想干|退出)/
  },
  {
    label: '未授权的包裹或账本证词',
    pattern: /(?:埃里克|父亲)[^。；！？\n]{0,72}(?:油布包|包裹|文书|账本)|(?:最后一次|上次)[^。；！？\n]{0,48}(?:七月初|月初)/
  },
  {
    label: '小册子中的未授权编码或交接记录',
    pattern: /(?:小册子|册子|夹页)[\s\S]{0,240}(?:C\.?\s*S\.?|BELL\s+ST|Delivery|07[\/-]10|货物交接安排|定期[^。；！？\n]{0,8}货物交接)/i
  },
  {
    label: '人物伤情',
    pattern: /(?:埃里克|他)[^。；！？\n]{0,48}(?:受伤|有伤|带伤|伤痕|淤青|青肿|嘴角.{0,4}肿|伤口|流血|骨折|手(?:一直|不停|不断)?(?:在)?(?:抖|发抖|颤抖))/
  },
  {
    label: '未确认的威胁经历',
    pattern: /(?:埃里克[^。；！？\n]{0,32})?(?:被人盯上|遭人跟踪|被追杀|遭到殴打)/
  },
  {
    label: '线索中的路线或设施细节',
    pattern: /(?:地图|笔记)[\s\S]{0,240}(?:泊位编号|仓库(?:布局|排列|分布)|绕过海关|海关检查站|秘密路线|逃生路线)/
  },
  {
    label: '未调查地点的活动细节',
    pattern: /(?:(?:药店|贝尔街14号|那地方)[^。；！？\n]{0,64}(?:晚上|夜里|夜间)[^。；！？\n]{0,20}(?:亮灯|灯光|灯亮)|(?:药店|贝尔街14号|那地方)[^。；！？\n]{0,64}(?:马车|车辆)[^。；！？\n]{0,20}(?:出入|进出|停靠)|(?:药店|贝尔街14号|那地方)[^。；！？\n]{0,64}(?:最近|近期|这几天|近来)[^。；！？\n]{0,16}(?:有人|人影|陌生人)[^。；！？\n]{0,10}(?:进出|出入|活动|出现|来往)|(?:药店|贝尔街14号|那地方)[^。；！？\n]{0,64}(?:转运|装卸)[^。；！？\n]{0,20}(?:货|货物)|蒙特利尔[^。；！？\n]{0,24}(?:手下|的人|派的人)[^。；！？\n]{0,16}(?:去过|到过|出入)|(?:入口|后门)[^。；！？\n]{0,20}(?:后巷|后街|锁[^。；！？\n]{0,6}(?:坏|断|开)))/
  },
  {
    label: '未授权的具体路线指引',
    pattern: /(?:酒保|蒙特利尔|伊莎贝拉)[^。；！？\n]{0,80}(?:往[东南西北]走|向[东南西北]走|穿过[^。；！？\n]{0,12}(?:路口|街口)|第[一二三四五六七八九十\d]+个路口[^。；！？\n]{0,8}(?:转|拐))/
  },
  {
    label: '未解锁的日期或行动时刻',
    pattern: /(?:地图|笔记|扶桑花号)[^。；！？\n]{0,96}(?:7月14日|子时|午夜|开船时间|离港时间)/
  },
  {
    label: '交涉条件',
    pattern: /(?:深潜者|混种|交涉代表)[^。；！？\n]{0,72}(?:带走.{0,8}货物|不(?:要|得)?追击|安全离港|释放埃里克|放走埃里克)/
  }
];

function authoredNarrativeCorpus(
  state: GameState,
  proposedEvents: ReturnType<typeof getAvailableStoryEvents>
): string {
  const definition = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const factById = new Map(definition.world.facts.map((fact) => [fact.id, fact.statement]));
  const ending = definition.progression.endings.find((candidate) => candidate.id === progress.endingId);
  const firedEvents = progress.firedEventIds.flatMap((id) =>
    definition.progression.storyEvents.find((event) => event.id === id)?.narrativeCue ?? []
  );
  return [
    ...progress.knownFactIds.flatMap((id) => factById.get(id) ?? []),
    ...firedEvents,
    ...proposedEvents.map((event) => event.narrativeCue),
    ending?.summary ?? ''
  ].join('\n');
}

function unsupportedPlotClaim(
  narrative: string,
  authority: string
): string | null {
  for (const { label, pattern } of PLOT_CLAIM_PATTERNS) {
    if (pattern.test(narrative) && !pattern.test(authority)) {
      return `不得用自由叙事创造未获作者授权的${label}`;
    }
  }
  return null;
}

export function validateNarratorSemantics(
  output: { narrative: string; activeNpc?: string | null; nextPrompt: string; playerChoices: Record<string, string[]> },
  toolCalls: DmToolCall[],
  state: GameState,
  kb: KnowledgeBase,
  actions: PlayerAction[] = []
): string | null {
  const allText = [
    output.narrative,
    output.nextPrompt,
    ...Object.values(output.playerChoices).flat()
  ].join('\n');
  const publicCorpus = publicScenarioCorpus(kb);
  const authorizedAddresses = new Set(extractAddressReferences(publicCorpus).map((item) => item.key));
  const outputAddresses = extractAddressReferences(allText);
  const inventedAddress = outputAddresses.find((item) =>
    ![...authorizedAddresses].some((address) => item.key.endsWith(address))
  );
  if (inventedAddress) return `不得创造模组未声明的地址：${inventedAddress.text}`;

  const numberedWarehouse = allText.match(/\b(?:[A-Za-z]\d*|\d+[A-Za-z]?)\s*(?:号)?仓(?:库)?/i)?.[0];
  if (numberedWarehouse && !publicCorpus.replace(/\s/g, '').includes(numberedWarehouse.replace(/\s/g, ''))) {
    return `不得创造模组未声明的仓库编号：${numberedWarehouse}`;
  }

  const declaredItems = [
    ...Object.values(kb.items).flatMap(({ public: item }) => [item.name, ...(item.aliases ?? [])]),
    ...state.players.flatMap((player) => [player.background?.meaningfulItem ?? '']),
    ...state.clues.map((clue) => clue.name)
  ].filter(Boolean);
  const itemClaim = /(?:取得|获得|拿到|找到|发现|捡到|收起|带走)[^。；！？\n]{0,12}?((?:[A-Za-z0-9]{1,4})?钥匙|通行证|徽章|账本)/.exec(allText);
  if (itemClaim) {
    const contextStart = Math.max(0, (itemClaim.index ?? 0) - 16);
    const contextEnd = (itemClaim.index ?? 0) + itemClaim[0].length + 16;
    const claimContext = allText.slice(contextStart, contextEnd);
    if (!declaredItems.some((item) => claimContext.includes(item))) {
      return `不得创造模组未声明的物品：${itemClaim[1]}`;
    }
  }

  const inventedAffiliation = allText.match(/([\u4e00-\u9fff]{2,8}(?:帮|会|社|党))(?:的)?(?:成员|人物|头目|老板)/)?.[1];
  if (inventedAffiliation && !publicCorpus.includes(inventedAffiliation)) {
    return `不得创造模组未声明的组织身份：${inventedAffiliation}`;
  }

  const progress = getScenarioProgressForState(state);
  const availableEvents = new Map(
    getAvailableStoryEvents(progress, state.currentScene).map((event) => [event.id, event])
  );
  const proposedEvents = toolCalls.flatMap((call) => {
    if (call.name !== 'propose_story_event') return [];
    const event = availableEvents.get(String(call.arguments.eventId ?? ''));
    return event ? [event] : [];
  });
  const startsUnresolvedCombat = state.currentScene === 'S05'
    && actions.some((action) => hasAffirmativeMatch(action.action, COMBAT_ACTION_RE))
    && !actions.some((action) => DICE_RESULT_RE.test(action.action))
    && proposedEvents.some((event) => event.id === 'EV_CHOOSE_COMBAT' || event.id === 'EV_COMBAT_ATTACK');
  const narratesCombatHit = /(?:命中|击中|打中|砸中|砸在|落在|攻击奏效)|(?:警棍|拳头|子弹|枪弹)[^。；！？\n]{0,24}(?:击中|打中|砸中|砸在|落在)|(?:深潜者|蹼状[^。；！？\n]{0,4}(?:手|手臂|肢体))[^。；！？\n]{0,24}(?:被击中|挨了一击|踉跄后退|鳞片碎裂)/.test(output.narrative);
  if (startsUnresolvedCombat && narratesCombatHit) {
    return '战斗攻击尚未完成结构化检定，正文不得提前叙述命中或攻击奏效';
  }
  const settledCombatHit = progress.variables.finaleRoute === 'combat'
    && (progress.encounters.ENC01?.defeated ?? 0) > 0
    && actions.some((action) =>
    /【检定结果】[^。；！？\n]{0,100}(?:格斗（拳）|射击（手枪）|CHECK_COMBAT)[^。；！？\n]{0,80}结果[：:]\s*(?:普通成功|成功|困难成功|极难成功|大成功)/.test(action.action)
    );
  const deniesCombatIncapacitation = /(?:并未|没有|未能)(?:立刻|完全)?倒下|仍(?:然)?(?:能够?|可以|在)(?:继续)?(?:战斗|抵抗)/.test(output.narrative);
  const confirmsCombatIncapacitation = /失去战斗能力|无力再战|退出战斗|无法继续战斗|不再抵抗|被制服/.test(output.narrative);
  if (settledCombatHit && deniesCombatIncapacitation && !confirmsCombatIncapacitation) {
    return '结构化战斗命中已使一名深潜者失去战斗能力，正文不得否定该结算';
  }
  const confirmsDefeatedDeepOne = /(?:倒地|瘫倒|失去战斗能力|无力再战|被制服)[^。；！？\n]{0,16}深潜者|深潜者[^。；！？\n]{0,16}(?:倒地|瘫倒|失去战斗能力|无力再战|被制服)/.test(output.narrative);
  const structuredDefeated = progress.encounters.ENC01?.defeated ?? 0;
  const claimedDefeatedMatch = /(?:已有|已经|共|总共|甲板上)?\s*([一二三四]|[1-4])\s*名(?:仍在抵抗的)?深潜者[^。；！？\n]{0,28}(?:倒地|瘫倒|失去战斗能力|无力再战|被制服|退出战斗)/.exec(output.narrative);
  const defeatedNumbers: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };
  const claimedDefeated = claimedDefeatedMatch
    ? defeatedNumbers[claimedDefeatedMatch[1]] ?? Number(claimedDefeatedMatch[1])
    : /(?:四名|所有|全部)[^。；！？\n]{0,12}深潜者[^。；！？\n]{0,24}(?:倒地|瘫倒|失去战斗能力|无力再战|被制服)|深潜者[^。；！？\n]{0,16}(?:全部|全都)[^。；！？\n]{0,16}(?:倒地|失去战斗能力|被制服)/.test(output.narrative)
      ? 4
      : null;
  if (
    progress.variables.finaleRoute === 'combat'
    && claimedDefeated !== null
    && claimedDefeated > structuredDefeated
  ) {
    return `正文宣称已有${claimedDefeated}名深潜者失去战斗能力，但结构化遭遇仅结算${structuredDefeated}名`;
  }
  if (
    progress.variables.finaleRoute === 'combat'
    && structuredDefeated < 4
    && /最后(?:一)?(?:名|个)[^。；！？\n]{0,32}(?:深潜者|守卫)[^。；！？\n]{0,72}(?:倒地|倒下|瘫倒|失去战斗能力|无力再战|被制服)|(?:深潜者|守卫)[^。；！？\n]{0,32}最后(?:一)?(?:名|个)[^。；！？\n]{0,72}(?:倒地|倒下|失去战斗能力|被制服)|(?:都|全部|全都)(?:已经)?(?:倒下|倒了|瘫倒|失去战斗能力|被制服)/.test(output.narrative)
  ) {
    return `结构化遭遇尚有${4 - structuredDefeated}名深潜者，正文不得提前宣告最后一名失去战斗能力`;
  }
  if (
    progress.variables.finaleRoute === 'combat'
    && structuredDefeated === 0
    && confirmsDefeatedDeepOne
  ) {
    return '没有结构化战斗命中时，正文不得把玩家自述的倒地深潜者当作既成战果';
  }
  if (progress.variables.finaleRoute === 'combat') {
    const pivotsToNegotiation = /(?:可以|不妨|愿意|还是|试着|尝试|转而|改为|开始)[^。；！？\n]{0,16}(?:谈谈|谈判|进行交涉|谈条件)|(?:与|和)[^。；！？\n]{0,12}(?:谈判|交涉|谈条件)|各取所需|不必再流血/.test(allText);
    const offersCombatRouteTrade = /(?:解开|解掉|割断|松开)[^。；！？\n]{0,10}(?:船缆|缆绳)[^。；！？\n]{0,24}(?:让我们走|放我们走|你们带走|人给你们)|(?:让我们走|放我们走)[^。；！？\n]{0,28}(?:你们带走|带他离开|人给你们|否则|他死)|(?:我们|深潜者)[^。；！？\n]{0,12}带货走[^。；！？\n]{0,12}(?:人给你们|你们带人)|(?:人给你们|货归我们)|最后机会[^。；！？\n]{0,20}(?:让我们走|放我们走)/.test(allText);
    if (pivotsToNegotiation || offersCombatRouteTrade) {
      return '战斗路线已经结构化锁定，正文和建议不得擅自转入交涉路线';
    }
    const inventsDeepOneReinforcements = /(?:船舱|舱口)[^。；！？\n]{0,32}(?:(?:还有|藏着|聚集着)[^。；！？\n]{0,12}(?:族人|深潜者|灰绿色[^。；！？\n]{0,4}身影)|(?:更多|大批|成群)[^。；！？\n]{0,8}(?:族人|深潜者|灰绿色[^。；！？\n]{0,4}身影)[^。；！？\n]{0,8}(?:涌出|冲出|出现))/.test(output.narrative);
    if (inventsDeepOneReinforcements) {
      return '结构化遭遇已限定深潜者总数，正文不得虚构船舱援军或额外敌人';
    }
  }
  const declaresRevolver = /左轮/.test(output.narrative)
    || actions.some((action) => /左轮/.test(action.action))
    || state.players.some((player) => (player.equipment ?? []).some((item) => /左轮/.test(item)));
  if (declaresRevolver && /退壳口|拉动?套筒|套筒(?:卡住|后座|复进)|弹匣/.test(output.narrative)) {
    return '左轮手枪没有半自动手枪的套筒、退壳口或弹匣，正文必须使用正确的左轮结构描述';
  }
  const assertsAmmunitionState = /(?:还|只|仅|尚)?(?:剩(?:余|下|有)?|余(?:下|有)?)\s*(?:最后)?\s*[一二三四五六七八九十百两\d]+\s*(?:发|颗|枚)(?:子弹|弹药)?|最后\s*[一二三四五六七八九十百两\d]+\s*(?:发|颗|枚)(?:子弹|弹药)?|(?:弹巢|弹仓|枪里)[^。；！？\n]{0,20}(?:打空|空了|无弹|没有子弹|剩余|还剩|只剩|仅余|只余)|(?:子弹|弹药)[^。；！？\n]{0,12}(?:没有|没了|耗尽|用尽|所剩无几)|(?:必须|需要|不得不|只能)[^。；！？\n]{0,16}(?:重新装填|装填|换弹|补充弹药)/.test(allText);
  if (assertsAmmunitionState) {
    return '当前规则未启用弹药计数，Narrator 不得声明剩余或耗尽弹药，也不得要求装填';
  }
  for (const action of actions) {
    if (!/(?:灯光|举灯|提灯|手电)/.test(action.action)) continue;
    const player = escapeRegex(action.player);
    const replacesLightWithMedicalKit = new RegExp(
      `${player}[^。；！？\\n]{0,28}(?:举着|拿着|握着|用)[^。；！？\\n]{0,16}(?:急救包|医疗箱|急救箱|金属箱)`
    ).test(output.narrative);
    if (replacesLightWithMedicalKit) {
      return `正文不得把${action.player}本轮明确使用的灯光替换成未声明使用的急救装备`;
    }
  }
  const demandsPendingCheck = /(?:需要|必须|务必|须得)[^。；！？\n]{0,24}检定|请[^。；！？\n]{0,12}(?:掷骰|进行)[^。；！？\n]{0,12}检定/.test(
    `${output.narrative}\n${output.nextPrompt}`
  );
  const hasAuthorizedCheck = toolCalls.some((call) => call.name === 'request_check')
    || proposedEvents.some((event) => event.effects.some((effect) => 'requestCheck' in effect));
  if (demandsPendingCheck && !hasAuthorizedCheck) {
    return '正文要求玩家检定时必须在同一响应调用获准的 request_check，不能留下没有掷骰入口的强制检定';
  }
  const harmedPlayers = state.players.filter((player) => narrativeHarmsPlayer(output.narrative, player.name));
  const hpDeltas = toolCalls.reduce<Record<string, number>>((deltas, call) => {
    if (call.name !== 'propose_state_update' || !call.arguments.hp
      || typeof call.arguments.hp !== 'object' || Array.isArray(call.arguments.hp)) return deltas;
    for (const [player, value] of Object.entries(call.arguments.hp as Record<string, unknown>)) {
      if (typeof value === 'number') deltas[player] = (deltas[player] ?? 0) + value;
    }
    return deltas;
  }, {});
  const uncommittedHarm = harmedPlayers.find((player) => !(hpDeltas[player.name] < 0));
  if (uncommittedHarm) {
    return `正文写明${uncommittedHarm.name}受到实际伤害时，必须同步调用 propose_state_update 写入负 HP`;
  }
  const narrativeAuthority = authoredNarrativeCorpus(state, proposedEvents);
  const failedMechanicalCheck = actions.some((action) =>
    /【检定结果】[^。；！？\n]{0,80}的\s*机械维修\s*检定[^。；！？\n]{0,80}结果[：:]\s*(?:失败|大失败)/.test(action.action)
  );
  const opensLockedEntry = /(?:门锁|锁具|锁芯|锁扣)[^。；！？\n]{0,24}(?:弹开|打开|开启|解开|脱落|断裂|失效|被撬开|成功撬开)|(?:门板|房门|木门|大门)[^。；！？\n]{0,20}(?:敞开|打开|开启|被推开)|(?:成功|终于|顺利)[^。；！？\n]{0,20}(?:撬开|打开|开启|破门|进入)[^。；！？\n]{0,12}(?:门|锁|药店)/;
  if (
    failedMechanicalCheck
    && opensLockedEntry.test(output.narrative)
    && !opensLockedEntry.test(narrativeAuthority)
  ) {
    return '机械维修检定失败后不得让另一角色无检定接手并直接打开门锁';
  }
  if (state.currentScene === 'S01' && /蒙特利尔/.test(allText) && !narrativeAuthority.includes('蒙特利尔')) {
    return '不得在住宅调查取得对应线索前提前点名蒙特利尔';
  }
  const bartenderLeadProposed = proposedEvents.some((event) => event.id === 'EV_BARTENDER_RAT');
  if (
    state.currentScene === 'S03'
    && !progress.knownFactIds.includes('F08')
    && !bartenderLeadProposed
    && /老鼠[^。；！？\n]{0,40}贝尔街|贝尔街[^。；！？\n]{0,40}老鼠/.test(allText)
  ) {
    return '酒保的“老鼠”与贝尔街线索必须通过 EV_BARTENDER_RAT 结算后才能透露';
  }
  const proposedClueIds = new Set(proposedEvents.flatMap((event) => event.effects.flatMap((effect) => {
    if ('discoverClue' in effect) return [effect.discoverClue];
    if ('analyzeClue' in effect) return [effect.analyzeClue];
    return [];
  })));
  const actionText = actions.map((action) => action.action).join('\n');
  const hasCheckOutcome = /【检定结果】/.test(actionText);
  const failedCheck = actionIsFailedCheck(actions);
  const uncommittedClueIds = inferDiscoveredItems(
    output.narrative,
    [],
    state,
    kb,
    state.currentScene
  ).filter((clueId) => {
    if (!hasCheckOutcome) return !proposedClueIds.has(clueId);
    const item = getScenarioDefinition().world.items.find((candidate) => candidate.id === clueId);
    const expectedEventId = item
      ? failedCheck ? item.discovery.failureEventId : item.discovery.successEventId
      : null;
    return expectedEventId
      ? !proposedEvents.some((event) => event.id === expectedEventId)
      : !proposedClueIds.has(clueId);
  });
  if (uncommittedClueIds.length) {
    const requirements = uncommittedClueIds.map((clueId) => {
      const item = kb.items[clueId]?.public;
      const scenarioItem = getScenarioDefinition().world.items.find((candidate) => candidate.id === clueId);
      const expectedEventId = hasCheckOutcome && scenarioItem
        ? failedCheck
          ? scenarioItem.discovery.failureEventId
          : scenarioItem.discovery.successEventId
        : null;
      const event = expectedEventId
        ? availableEvents.get(expectedEventId)
        : [...availableEvents.values()].find((candidate) =>
        candidate.effects.some((effect) =>
          ('discoverClue' in effect && effect.discoverClue === clueId)
          || ('analyzeClue' in effect && effect.analyzeClue === clueId)
        )
      );
      return event ? `${item?.name ?? clueId} -> ${event.id}` : `${item?.name ?? clueId} -> 无可用事件`;
    });
    return `正文发现的线索必须在同一响应调用对应剧情事件，并同步写出事件规定的人物和作者地址：${requirements.join('；')}`;
  }
  const rescueAuthorized = progress.variables.ericRescued === true
    || progress.endingId === 'END_A'
    || progress.endingId === 'END_C'
    || proposedEvents.some((event) => eventAuthorizesOutcome(event, 'rescue'));
  const endingAuthorized = Boolean(progress.endingId)
    || proposedEvents.some((event) => eventAuthorizesOutcome(event, 'ending'));
  const claimsRescue = /埃里克[^。；！？\n]{0,20}(?:获救|被救出|被释放|脱困|离开船舱|离开扶桑花号|踏上码头|到了码头)|(?:获救的|被救出的|被释放的)[^。；！？\n]{0,8}埃里克|(?:救出|释放)[^。；！？\n]{0,12}埃里克|(?:割断|剪断|解开|扯开|挣开)[^。；！？\n]{0,20}(?:绳|绳索|绳结|绑缚|束缚)|(?:扶起|搀扶|架住|护送|带着)[^。；！？\n]{0,20}埃里克[^。；！？\n]{0,28}(?:离开|撤离|下船|甲板|栈桥|码头)/.test(output.narrative);
  const claimsDeparture = /扶桑花号[^。；！？\n]{0,18}(?:已(?:经)?离港|驶离泊位|驶离港口|离开港口|消失在(?:浓雾|雾中|水面))/.test(output.narrative);
  if ((claimsRescue && !rescueAuthorized) || (claimsDeparture && !endingAuthorized)) {
    return '不得在对应剧情事件结算前宣告权威剧情结果';
  }

  for (const proposed of proposedEvents) {
    const clueIds = new Set(proposed.effects.flatMap((effect) => {
      if ('discoverClue' in effect) return [effect.discoverClue];
      if ('analyzeClue' in effect) return [effect.analyzeClue];
      return [];
    }));
    for (const clueId of clueIds) {
      const item = kb.items[clueId]?.public;
      if (!item) continue;
      const terms = [item.name, ...(item.aliases ?? [])];
      if (!terms.some((term) => output.narrative.includes(term))) {
        return `剧情发现事件 ${proposed.id} 必须在正文中说明对应线索：${item.name}`;
      }
    }

    const cueNpcs = Object.values(kb.npcs).filter(({ public: npc }) =>
      [npc.name, ...(npc.aliases ?? [])].some((term) => proposed.narrativeCue.includes(term))
    );
    for (const { public: npc } of cueNpcs) {
      const terms = [npc.name, ...(npc.aliases ?? [])];
      if (!terms.some((term) => output.narrative.includes(term))) {
        return `剧情事件 ${proposed.id} 必须在正文中说明涉及人物：${npc.name}`;
      }
    }

    const normalizedCue = proposed.narrativeCue.replace(/\s/g, '');
    const normalizedOutput = allText.replace(/\s/g, '');
    const cueAddresses = [...authorizedAddresses].filter((address) =>
      normalizedCue.includes(address.replace(/\s/g, ''))
    );
    const missingAddress = cueAddresses.find((address) =>
      !normalizedOutput.includes(address.replace(/\s/g, ''))
    );
    if (missingAddress) {
      return `剧情事件 ${proposed.id} 必须使用作者地址：${missingAddress}`;
    }
  }
  if (/注射[^。；\n]{0,12}活性炭|浓盐水[^。；\n]{0,12}催吐|试喝|尝一口/.test(allText)) {
    return '不得给出危险的现实医疗处置或建议品尝未知物质';
  }
  if (/ICU|重症监护室|床旁心电监护|防化服|特警队/.test(allText)) {
    return `叙事必须符合${kb.era}，不得出现时代错误的设备或机构`;
  }
  if (
    /\b\d{1,2}[:：]\d{2}\b|(?:凌晨|上午|中午|下午|傍晚|晚上|夜里)?\s*(?:[零一二两三四五六七八九十]{1,3}|\d{1,2})\s*(?:点(?:半|一刻|三刻)?|时整)|钟(?:声)?(?:敲|响)(?:了)?(?:[零一二两三四五六七八九十]{1,3}|\d{1,2})(?:下|声)|(?:子时|午夜|正午)/.test(allText)
  ) {
    return '不得在自由叙事中复述精确钟点；世界时钟由规则结算并以界面世界时间为准';
  }
  const worldHour = Number(/T(\d{2}):\d{2}$/.exec(progress.worldTime)?.[1] ?? Number.NaN);
  if (Number.isFinite(worldHour)) {
    if (worldHour >= 17 && /(?:下午|午后)/.test(allText)) {
      return '叙事时段必须与结构化世界时间一致；17:00 后不得继续称为下午或午后';
    }
    if ((worldHour >= 20 || worldHour < 5) && /(?:清晨|早晨|上午|中午|下午|午后|傍晚)/.test(allText)) {
      return '叙事时段必须与结构化世界时间一致；当前已是夜间';
    }
    if (worldHour >= 5 && worldHour < 20 && /(?:夜色已深|夜已深|夜深人静|深夜)/.test(allText)) {
      return '叙事时段必须与结构化世界时间一致；20:00 前不得写成深夜';
    }
  }
  if (/(?:抵达|到达|进入|来到|赶到)[^。；\n]{0,12}(?:医院|仓库|教堂|洞穴)/.test(output.narrative)) {
    return '不得把知识库外地点叙述为已经抵达的新主场景';
  }
  const inventedStreet = allText.match(/(?:泰晤士街|[\u4e00-\u9fff]{2,6}大街)/)?.[0];
  if (inventedStreet && inventedStreet !== '纽伦上街') {
    return `不得创造模组未声明的街道：${inventedStreet}`;
  }
  const registeredPoliceTerms = Object.values(kb.scenes).flatMap(({ public: scene }) =>
    [scene.name, ...(scene.aliases ?? [])].filter((term) => /分局|警察局|警局/.test(term))
  );
  const undeclaredPrecinct = undeclaredPrecinctMention(allText, registeredPoliceTerms);
  if (undeclaredPrecinct) {
    return `不得创造模组未声明的警局：${undeclaredPrecinct}`;
  }

  const repeated = state.messages
    .filter((message) => message.type === 'dm')
    .slice(-6)
    .some((message) => textSimilarity(message.text, output.narrative) >= 0.72);
  if (repeated) return '本轮叙事与近期段落高度重复，必须只写新进展';

  const allowedInventory = [
    ...state.players.flatMap((player) => player.equipment ?? []),
    ...state.players.flatMap((player) => [player.background?.meaningfulItem ?? '']),
    ...state.clues.map((clue) => clue.name)
  ].join('、');
  const assertsFirearmUse = /(?:拔出|掏出|抽出|举起|握住|使用|用)[^。；！？\n]{0,12}(?:手枪|左轮枪|步枪)|(?:手枪|左轮枪|步枪)[^。；！？\n]{0,12}(?:开火|射击|击发|命中)/.test(allText);
  if (assertsFirearmUse && !/手枪|左轮枪|步枪/.test(allowedInventory)) {
    return '调查员没有被记录的枪械，不得凭空赋予武器';
  }
  const unarmedFirearmActor = state.players.find((player) => {
    if (player.equipment?.some((item) => /手枪|左轮枪|步枪/.test(item))) return false;
    return allText.split(/[。；！？\n]/).some((sentence) => {
      const actorIndex = sentence.indexOf(player.name);
      if (actorIndex < 0) return false;
      return /^(?:.{0,16})(?:拔出|掏出|抽出|举起|握住|使用|用).{0,10}(?:手枪|左轮枪|步枪)/
        .test(sentence.slice(actorIndex + player.name.length));
    });
  });
  if (unarmedFirearmActor) {
    return `${unarmedFirearmActor.name}没有被记录的枪械，不得把队友装备转移给该角色`;
  }

  const acceptedScene = toolCalls.find((call) => call.name === 'propose_scene_change');
  const targetId = acceptedScene ? String(acceptedScene.arguments.targetSceneId ?? '') : '';
  const outputSceneId = (targetId || state.currentScene) as SceneId;
  const pharmacyEntrySettled = targetId === 'S04'
    || (state.currentScene === 'S04' && progress.firedEventIds.includes('EV_S04_FOG'));
  const framesPharmacyAsInaccessible = /(?:正门|木门|店门|门板)[^。；！？\n]{0,24}(?:紧闭|上锁|锁住|无法打开)|(?:锁头|门锁|锁扣)[^。；！？\n]{0,20}(?:落着灰尘|仍在|完好|锁着)|(?:停在|站在|留在)[^。；！？\n]{0,16}(?:药店)?(?:门外|店外)/.test(allText);
  if (pharmacyEntrySettled && framesPharmacyAsInaccessible) {
    return 'S04 入场事件已将后门从内侧撞开并让调查员进入药店，正文和建议不得又把入口写成锁死的额外关卡';
  }
  const repeatsPharmacyEntry = state.currentScene === 'S04'
    && progress.firedEventIds.includes('EV_S04_FOG')
    && /(?:推开|撞开|打开|撬开)[^。；！？\n]{0,18}(?:后门|店门)|(?:后门|店门)[^。；！？\n]{0,12}(?:推开|撞开|打开|撬开)|(?:再次|重新)[^。；！？\n]{0,12}(?:进入|走进)[^。；！？\n]{0,8}(?:药店|店内)/.test(allText);
  if (repeatsPharmacyEntry) {
    return 'S04 入场事件已经结算，调查员已在药店内，不得重复开门或重新进入药店';
  }
  const deniesSettledPharmacyEntry = state.currentScene === 'S04'
    && progress.firedEventIds.includes('EV_S04_FOG')
    && /(?:这是|仍是)?首次进入[^。；！？\n]{0,24}(?:需要|必须|应当|尚未)[^。；！？\n]{0,16}触发(?:进入|入场)事件|(?:进入|入场)事件[^。；！？\n]{0,20}(?:尚未|还没|仍未)(?:触发|结算)/.test(allText);
  if (deniesSettledPharmacyEntry) {
    return 'S04 入场事件已经结算，不得声称首次进入仍待触发';
  }
  if (/(?:没有|没能|未能|完全没有)[^。；！？\n]{0,24}(?:发现|注意|察觉|看见)[^。；！？\n]{0,40}(?:人影|身影|跟踪者|尾随者)/.test(output.narrative)) {
    return '不得通过全知叙事向玩家泄露调查员检定失败后未察觉的人物或跟踪者';
  }
  if (targetId && targetId !== state.currentScene) {
    const sourceTerms = sceneTerms(kb, state.currentScene);
    const targetTerms = sceneTerms(kb, outputSceneId);
    if (framesForeignSceneAsCurrent(allText, sourceTerms)) {
      return `场景切换已原子结算为${kb.scenes[outputSceneId]?.public.name ?? outputSceneId}，不得继续把${kb.scenes[state.currentScene]?.public.name ?? state.currentScene}写成当前环境`;
    }
    if (deniesArrivalAtScene(allText, targetTerms)) {
      return `场景切换已原子结算，不得声称尚未抵达${kb.scenes[outputSceneId]?.public.name ?? outputSceneId}`;
    }
    if (!targetTerms.some((term) => allText.includes(term))) {
      return `场景切换正文必须说明已经抵达${kb.scenes[outputSceneId]?.public.name ?? outputSceneId}`;
    }
  }
  if (
    output.activeNpc
    && !kb.scenes[outputSceneId]?.public.npcs.includes(output.activeNpc)
  ) {
    return `activeNpc 指向不在当前场景的 ${output.activeNpc}`;
  }
  const appearanceConflict = activeNpcAppearanceConflict(
    output.narrative,
    output.activeNpc,
    outputSceneId,
    kb
  );
  if (appearanceConflict) {
    return `不得改写权威人物外貌：${appearanceConflict}`;
  }
  const inventedSpeaker = unavailableNpcRole(output.narrative, kb, outputSceneId);
  if (inventedSpeaker) {
    return `当前场景没有已登记的${inventedSpeaker}，不得让未授权 NPC 参与对话`;
  }
  const plotClaimIssue = unsupportedPlotClaim(
    allText,
    narrativeAuthority
  );
  if (plotClaimIssue) return plotClaimIssue;
  const bellStreetAuthorized = narrativeAuthority.includes('贝尔街')
    || state.currentScene === 'S04'
    || progress.visitedSceneIds.includes('S04');
  if (/贝尔街/.test(allText) && !bellStreetAuthorized) {
    return '不得在取得对应线索或进入药店前提前透露贝尔街';
  }
  const bookletWillBeAnalyzed = proposedEvents.some((event) =>
    event.effects.some((effect) => 'analyzeClue' in effect && effect.analyzeClue === 'I04')
  );
  const bookletAnalyzed = progress.clueStates.I04 === 'analyzed' || bookletWillBeAnalyzed;
  if (
    !bookletAnalyzed
    && /(?:小册子|册子|夹页)[^。；！？\n]{0,80}(?:隐写|隐藏字迹)[^。；！？\n]{0,32}(?:显出|显现|浮现|清晰|可辨认)|(?:隐写|隐藏字迹)[^。；！？\n]{0,48}(?:显出|显现|浮现|清晰|可辨认)[^。；！？\n]{0,48}(?:小册子|册子|夹页)/.test(allText)
  ) {
    return '小册子隐写只有通过 EV_FIND_I04 结算后才能在正文中显现';
  }
  if (
    !bookletAnalyzed
    && /(?:小册子|册子|封面|夹页)[^。；！？\n]{0,64}(?:货物运输|运输标识|货运标识|公司标记|走私标记|走私含义)/.test(allText)
  ) {
    return '小册子尚未分析，不得创造封面或夹页中的运输、公司或走私含义';
  }
  const unknownVenueArrival = output.narrative.match(
    /(?:抵达|到达|进入|来到|赶到|回到|走进|拜访)[^。；！？\n]{0,16}(?:贸易行|事务所|诊所|商店|旅馆|餐馆)/
  )?.[0];
  if (unknownVenueArrival) {
    const knownDestination = Object.keys(kb.scenes).some((sceneId) =>
      sceneTerms(kb, sceneId as SceneId).some((term) => unknownVenueArrival.includes(term))
    );
    if (!knownDestination) return `不得把模组未声明地点写成已抵达场景：${unknownVenueArrival}`;
  }
  if (targetId && /与此同时[^。；\n]{0,24}(?:独自|一人|发动汽车|驾车|开车)/.test(output.narrative)) {
    return '共同调查切场时全队同行，不得把移动写成单人分头行动';
  }
  for (const [sceneId, entry] of Object.entries(kb.scenes) as Array<[SceneId, KnowledgeBase['scenes'][SceneId]]>) {
    if (sceneId === state.currentScene || sceneId === targetId) continue;
    const mentionsScene = sceneTerms(kb, sceneId).some((term) => output.narrative.includes(term));
    if (mentionsScene && /抵达|到达|进入|来到|赶到|回到/.test(output.narrative)) {
      return `叙事声称抵达${entry.public.name}，但没有对应的合法场景切换`;
    }
    if (framesForeignSceneAsCurrent(output.narrative, sceneTerms(kb, sceneId))) {
      return `叙事把${entry.public.name}写成当前环境，但没有对应的合法场景切换`;
    }
  }
  const lockedScene = lockedSceneReference(allText, narrativeAuthority, state, kb, proposedEvents);
  if (lockedScene) {
    return `不得在作者事件或可达性解锁前提及锁定地点：${lockedScene}`;
  }
  return null;
}
