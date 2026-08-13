import type { AiResponse, CheckRequest, GameState, SceneId } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import type { DmToolCall, KnowledgeBase } from './types';
import { getActiveKnowledgeBase } from './knowledgeBase';
import {
  getScenarioDefinition,
  getAvailableSceneExits,
  getAvailableStoryEvents,
  getScenarioProgressForState
} from '../scenario/engine';

const DICE_RESULT_RE = /【检定结果】|结果[：:]\s*(?:失败|大失败|成功|困难成功|极难成功|大成功)/;
const MOVE_VERB_RE = /前往|赶往|去往|转往|改去|改从|出发|动身|返回|回到|离开|开车|驾车|驱车|驶向|跟随|追到|抵达|到达/;
const MOVE_DESTINATION_RE = /前往|赶往|去往|转往|改去|改从|驶向|追到|抵达|到达|进入|登上|回到|返回|去/;
const NPC_ROLE_TERMS = ['店主', '老板', '伙计', '服务生', '医生', '护士', '牧师', '管理员', '警员', '警察', '酒保'];

interface CheckCandidate {
  score: number;
  check: CheckRequest;
}

function buildCandidate(action: PlayerAction): CheckCandidate | null {
  const text = action.action.trim();
  if (!text || DICE_RESULT_RE.test(text)) return null;

  const specs: Array<{
    pattern: RegExp;
    skill: string;
    score: number;
    difficulty?: CheckRequest['difficulty'];
    reason: string;
  }> = [
    { pattern: /开枪|射击|瞄准|扣扳机/, skill: '射击（手枪）', score: 100, difficulty: '困难', reason: '在压力下完成射击' },
    { pattern: /攻击|搏斗|出拳|殴打|近战|制服/, skill: '格斗（拳）', score: 95, difficulty: '困难', reason: '冲突行动存在受伤风险' },
    { pattern: /闪避|躲开|避开|逃脱/, skill: '闪避', score: 92, difficulty: '困难', reason: '避开迫近的危险' },
    { pattern: /潜入|潜行|蹑手蹑脚|躲藏|尾随/, skill: '潜行', score: 88, reason: '不被察觉地完成行动' },
    { pattern: /撬锁|开锁|拆开|修理|修复/, skill: '机械维修', score: 84, reason: '完成精细的机械操作' },
    { pattern: /高速|追车|甩开|危险驾驶|强行驾车/, skill: '驾驶（汽车）', score: 82, difficulty: '困难', reason: '在危险条件下驾驶' },
    { pattern: /急救|止血|包扎|抢救/, skill: '急救', score: 80, reason: '实施紧急救治' },
    { pattern: /诊断|化验|解剖|中毒|药剂|粉末|医学检查/, skill: '医学', score: 76, reason: '判断医学或药物线索' },
    { pattern: /威胁|恐吓|逼问/, skill: '恐吓', score: 72, reason: '迫使对方提供信息' },
    { pattern: /说服|劝说|谈判|请求/, skill: '说服', score: 70, reason: '改变对方的态度' },
    { pattern: /套话|撒谎|骗|假装|攀谈/, skill: '话术', score: 68, reason: '从交谈中取得进展' },
    { pattern: /查阅|档案|文献|图书馆|翻书/, skill: '图书馆', score: 62, reason: '从资料中定位可靠信息' },
    { pattern: /观察[^，。；！？\n]{0,16}(?:表情|神色|脸色|肢体|反应)|判断[^，。；！？\n]{0,12}(?:真假|说谎|隐瞒)|是否说谎|心理/, skill: '心理学', score: 60, reason: '判断对方的真实反应' },
    { pattern: /聆听|偷听|听清|门外动静/, skill: '聆听', score: 56, reason: '分辨不易察觉的声音' },
    { pattern: /搜查|搜索|搜寻|检查|观察|查看/, skill: '侦查', score: 52, reason: '发现不明显的线索' }
  ];

  const spec = specs.find((item) => hasAffirmativeMatch(text, item.pattern));
  if (!spec) return null;
  return {
    score: spec.score,
    check: {
      player: action.player,
      skill: spec.skill,
      difficulty: spec.difficulty ?? '普通',
      reason: spec.reason
    }
  };
}

function hasAffirmativeMatch(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(matcher)) {
    const prefix = text.slice(0, match.index ?? 0).slice(-12);
    if (/不得不[^，。；！？\n]{0,4}$/.test(prefix)) return true;
    if (/(?:询问|追问|问|确认|说明|调查|判断|回忆|是否|有没有|有无|曾否|是不是|是不是曾)[^，。；！？\n]{0,10}$/.test(prefix)) {
      continue;
    }
    if (/(?:不|未|没有|并未|并不|不要|不再|暂不|暂缓|停止|避免|放弃|拒绝|无意|不想)[^，。；！？\n]{0,6}$/.test(prefix)) {
      continue;
    }
    return true;
  }
  return false;
}

/** Picks at most one check because the current UI can settle one pending check at a time. */
export function buildRequiredCheck(actions: PlayerAction[], state: GameState): CheckRequest | null {
  if (actions.some((action) => DICE_RESULT_RE.test(action.action))) return null;
  const storyCall = inferStoryEventFromActions(actions, state);
  if (storyCall) {
    const eventId = String(storyCall.arguments.eventId ?? '');
    // Route selection is an atomic authored decision. Let it settle before a
    // follow-up attack/listen keyword can create an untracked generic check.
    if (eventId === 'EV_CHOOSE_NEGOTIATION' || eventId === 'EV_CHOOSE_COMBAT') return null;
    const event = getAvailableStoryEvents(
      getScenarioProgressForState(state),
      state.currentScene
    ).find((candidate) => candidate.id === eventId);
    if (event?.effects.some((effect) => 'requestCheck' in effect)) return null;
  }
  const kb = getActiveKnowledgeBase();
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
  for (const candidate of candidates) {
    const player = state.players.find((item) => item.name === candidate.check.player);
    if (!player) continue;
    if (!player.skills[candidate.check.skill]) {
      const fallback = candidate.check.skill === '机械维修' ? '侦查' : null;
      if (!fallback || !player.skills[fallback]) continue;
      return { ...candidate.check, skill: fallback };
    }
    return applyAuthoredCheckDifficulty(candidate.check, targetScene);
  }
  return null;
}

function explicitlyTargetedScenarioItems(
  actions: PlayerAction[],
  state: GameState,
  kb: KnowledgeBase
) {
  const definition = getScenarioDefinition();
  const discovered = new Set(state.clues.map((clue) => clue.id));
  const actionText = actions
    .filter((action) => !DICE_RESULT_RE.test(action.action))
    .map((action) => action.action)
    .join('\n');
  return definition.world.items.filter((item) => {
    if (item.sceneId !== state.currentScene || discovered.has(item.id)) return false;
    return [item.name, ...(kb.items[item.id]?.public.aliases ?? [])]
      .some((term) => term && actionText.includes(term));
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function framesForeignSceneAsCurrent(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    if (!term || term.length < 2) return false;
    const escaped = escapeRegex(term);
    return new RegExp(
      `(?:仍在|正在|身处|留在|待在|站在|坐在|回到|进入|走进|来到|抵达|到达|赶到)[^。；！？\\n]{0,12}${escaped}`
      + `|${escaped}(?:里|内|中|外|门口|门廊|大厅|办公室|吧台|柜台|后厅)[^。；！？\\n]{0,24}(?:仍|正|有|坐|站|走|聚|传来|响起|闲聊|说话)`,
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
    if (!lastDestinationVerb) return false;
    const between = prefix.slice((lastDestinationVerb.index ?? 0) + lastDestinationVerb[0].length);
    return !/[，。；！？\n]/.test(between) && lastDestinationVerb[0] !== '离开';
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
    ['EV_FIND_I04', /加热|烘烤|显字|破译|解读.{0,8}(?:小册子|隐写)|(?:小册子|隐写).{0,8}(?:解读|解码)/],
    ['EV_MEET_MONTREAL', /质询.{0,8}蒙特利尔|蒙特利尔.{0,8}关系/],
    ['EV_BARTENDER_RAT', /酒保[\s\S]{0,20}(?:老鼠|贝尔街)|(?:老鼠|贝尔街)[\s\S]{0,20}酒保/],
    ['EV_S04_CIGAR', /雪茄/],
    ['EV_CHOOSE_NEGOTIATION', /选择.{0,8}交涉|和平交涉|愿意.{0,8}交涉|尝试.{0,8}交涉|暂缓攻击|不(?:发动|使用).{0,6}(?:攻击|武力)/],
    [
      'EV_NEGOTIATION_LISTEN',
      /聆听.{0,12}诉求|理解.{0,12}诉求|(?:提出|确认|完成).{0,12}(?:交换|条件)|说服.{0,12}(?:释放|放走).{0,8}埃里克|不碰.{0,8}货物.{0,16}(?:释放|放走)/
    ],
    ['EV_CHOOSE_COMBAT', /选择.{0,8}战斗|立即.{0,8}战斗|攻击.{0,8}深潜者/],
    ['EV_COMBAT_ATTACK', /攻击|搏斗|出拳|制服|击败/]
  ];
  const match = mappings.find(([eventId, pattern]) =>
    available.has(eventId)
    && pattern.test(text)
    && (!actionIsFailedCheck(actions) || eventId === 'EV_BARTENDER_RAT' || eventId === 'EV_MEET_MONTREAL')
  );
  return match ? {
    name: 'propose_story_event',
    arguments: { eventId: match[0], reason: '玩家行动明确满足作者事件意图' }
  } : null;
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
    const prefix = index >= 0 ? narrative.slice(Math.max(0, index - 10), index) : '';
    if (/没有|未能|没能|找不到|未发现|并无/.test(prefix)) continue;
    out.push(id);
  }
  return out;
}

function mergeDelta(target: Record<string, number>, player: string, delta: number): void {
  target[player] = (target[player] ?? 0) + delta;
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
  const san = { ...(response.stateUpdate?.san ?? {}) };
  const involved = new Set(actions.map((action) => action.player));

  if (/中弹|被击中|受伤|流血|灼伤|划伤|骨折|剧痛/.test(narrative)) {
    for (const player of state.players) {
      if (involved.has(player.name) && hp[player.name] === undefined) mergeDelta(hp, player.name, -1);
    }
  }
  if (/深潜者|非人的怪物|不可名状|触手|活祭|献祭|异形生物/.test(narrative)) {
    for (const player of state.players) {
      if (involved.has(player.name) && san[player.name] === undefined) mergeDelta(san, player.name, -1);
    }
  }

  return {
    ...response,
    stateUpdate: {
      ...response.stateUpdate,
      hp,
      san
    }
  };
}

export function sanitizePlayerChoices(
  choices: Record<string, string[]>,
  discoveredIds: ReadonlySet<string>,
  kb: KnowledgeBase,
  sceneId?: SceneId
): Record<string, string[]> {
  const hiddenTerms = Object.entries(kb.items)
    .filter(([id]) => !discoveredIds.has(id))
    .flatMap(([, entry]) => [entry.public.name, ...(entry.public.aliases ?? [])])
    .filter((term) => term.length >= 2);
  const fallback = ['继续观察当前环境', '与在场人物核对已知事实', '整理已经发现的线索'];
  const offstageNpcNames = sceneId
    ? Object.keys(kb.npcs).filter((name) => !kb.scenes[sceneId]?.public.npcs.includes(name))
    : [];
  return Object.fromEntries(Object.entries(choices).map(([player, list]) => {
    const safe = list.filter((choice) =>
      !hiddenTerms.some((term) => choice.includes(term))
      && !offstageNpcNames.some((name) => choice.includes(name))
      && !(sceneId && unavailableNpcRole(choice, kb, sceneId, true))
    );
    for (const item of fallback) {
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
    pattern: /(?:伊莎贝拉|埃里克|父亲|父女|我们)[^。；！？\n]{0,56}(?:大吵|争吵|吵架|因为.{0,12}(?:花钱|欠债|债务)|(?:存在|有|背负|隐瞒|欠下).{0,8}(?:欠债|债务)|财务困难|手头紧)/
  },
  {
    label: '未解锁的人物关系',
    pattern: /(?:蒙特利尔[^。；！？\n]{0,48}(?:认识|熟悉|朋友|旧识|关照|与埃里克[^。；！？\n]{0,12}(?:关系|同框))|(?:埃里克|父亲)[^。；！？\n]{0,40}蒙特利尔[^。；！？\n]{0,16}(?:认识|熟悉|朋友|旧识|关照))/
  },
  {
    label: '失踪前的未授权行踪细节',
    pattern: /(?:埃里克|父亲)[^。；！？\n]{0,56}(?:傍晚|晚上)[^。；！？\n]{0,20}(?:离开|出门)|(?:去|前往)[^。；！？\n]{0,12}老赫特[^。；！？\n]{0,24}(?:见|会面)[^。；！？\n]{0,8}(?:朋友|生意伙伴)/
  },
  {
    label: '人物身份或背景',
    pattern: /(?:老鼠|埃里克|蒙特利尔)[^。；！？\n]{0,32}(?:东欧口音|瘦子|走私者|帮派成员|船员|水手|毒贩)/
  },
  {
    label: '犯罪、交易或胁迫关系',
    pattern: /(?:老鼠|埃里克|蒙特利尔)[^。；！？\n]{0,40}(?:运过.{0,6}货|运输|走私|贩卖|交易|生意往来|同伙|绑架|雇佣|指使|收买|勾连|翻脸|不肯放手|不想干|退出)/
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
    pattern: /(?:地图|笔记)[^。；！？\n]{0,96}(?:泊位编号|仓库(?:布局|排列|分布)|绕过海关|海关检查站|秘密路线|逃生路线)/
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
  kb: KnowledgeBase
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
  const proposedClueIds = new Set(proposedEvents.flatMap((event) => event.effects.flatMap((effect) => {
    if ('discoverClue' in effect) return [effect.discoverClue];
    if ('analyzeClue' in effect) return [effect.analyzeClue];
    return [];
  })));
  const uncommittedClueIds = inferDiscoveredItems(
    output.narrative,
    [],
    state,
    kb,
    state.currentScene
  ).filter((clueId) => !proposedClueIds.has(clueId));
  if (uncommittedClueIds.length) {
    const requirements = uncommittedClueIds.map((clueId) => {
      const item = kb.items[clueId]?.public;
      const event = [...availableEvents.values()].find((candidate) =>
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
    || Boolean(progress.endingId)
    || proposedEvents.some((event) => eventAuthorizesOutcome(event, 'rescue'));
  const endingAuthorized = Boolean(progress.endingId)
    || proposedEvents.some((event) => eventAuthorizesOutcome(event, 'ending'));
  const claimsRescue = /埃里克[^。；！？\n]{0,12}(?:获救|被救出|被释放|脱困)|(?:救出|释放)[^。；！？\n]{0,8}埃里克|(?:割断|解开)[^。；！？\n]{0,8}(?:绳索|绑缚)|埃里克[^。；！？\n]{0,48}(?:被搀扶|重新出现在甲板|离开船舱)/.test(output.narrative);
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
  const policeText = registeredPoliceTerms
    .sort((left, right) => right.length - left.length)
    .reduce((text, term) => text.replaceAll(term, ''), allText);
  const undeclaredPrecinct = policeText.match(/[\u4e00-\u9fff]{1,10}(?:分局|警察局|警局)/)?.[0];
  if (undeclaredPrecinct) {
    return `不得创造模组未声明的警局：${undeclaredPrecinct}`;
  }

  const repeated = state.messages
    .filter((message) => message.type === 'dm')
    .slice(-6)
    .some((message) => textSimilarity(message.text, output.narrative) >= 0.72);
  if (repeated) return '本轮叙事与近期段落高度重复，必须只写新进展';

  const allowedInventory = [
    ...state.players.flatMap((player) => [player.background?.meaningfulItem ?? '']),
    ...state.clues.map((clue) => clue.name)
  ].join('、');
  if (/手枪|左轮枪|步枪/.test(allText) && !/手枪|左轮枪|步枪/.test(allowedInventory)) {
    return '调查员没有被记录的枪械，不得凭空赋予武器';
  }

  const acceptedScene = toolCalls.find((call) => call.name === 'propose_scene_change');
  const targetId = acceptedScene ? String(acceptedScene.arguments.targetSceneId ?? '') : '';
  const outputSceneId = (targetId || state.currentScene) as SceneId;
  if (
    output.activeNpc
    && !kb.scenes[outputSceneId]?.public.npcs.includes(output.activeNpc)
  ) {
    return `activeNpc 指向不在当前场景的 ${output.activeNpc}`;
  }
  const inventedSpeaker = unavailableNpcRole(output.narrative, kb, outputSceneId);
  if (inventedSpeaker) {
    return `当前场景没有已登记的${inventedSpeaker}，不得让未授权 NPC 参与对话`;
  }
  const plotClaimIssue = unsupportedPlotClaim(
    allText,
    authoredNarrativeCorpus(state, proposedEvents)
  );
  if (plotClaimIssue) return plotClaimIssue;
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
  return null;
}
