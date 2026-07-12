import type { AiResponse, CheckRequest, GameState, SceneId } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import type { DmToolCall, KnowledgeBase } from './types';
import { getAvailableSceneExits, getScenarioProgressForState } from '../scenario/engine';
import { getAvailableStoryEvents } from '../scenario/engine';

const DICE_RESULT_RE = /【检定结果】|结果[：:]\s*(?:失败|大失败|成功|困难成功|极难成功|大成功)/;
const MOVE_VERB_RE = /前往|赶往|去往|出发|动身|返回|回到|离开|开车|驾车|驱车|驶向|跟随|追到|抵达|到达/;

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
    { pattern: /观察表情|判断真假|是否说谎|心理/, skill: '心理学', score: 60, reason: '判断对方的真实反应' },
    { pattern: /聆听|偷听|听清|门外动静/, skill: '聆听', score: 56, reason: '分辨不易察觉的声音' },
    { pattern: /搜查|搜索|搜寻|检查|观察|调查|寻找|查看/, skill: '侦查', score: 52, reason: '发现不明显的线索' }
  ];

  const spec = specs.find((item) => item.pattern.test(text));
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

/** Picks at most one check because the current UI can settle one pending check at a time. */
export function buildRequiredCheck(actions: PlayerAction[], state: GameState): CheckRequest | null {
  if (actions.some((action) => DICE_RESULT_RE.test(action.action))) return null;
  const candidates = actions
    .map(buildCandidate)
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
    return candidate.check;
  }
  return null;
}

function sceneTerms(kb: KnowledgeBase, sceneId: SceneId): string[] {
  const scene = kb.scenes[sceneId]?.public;
  return scene ? [scene.id, scene.name, ...(scene.aliases ?? [])] : [];
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
    if (!MOVE_VERB_RE.test(action.action)) continue;
    const target = reachable.find((sceneId) =>
      sceneTerms(kb, sceneId).some((term) => term && action.action.includes(term))
    );
    if (target) {
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
    ['EV_FIND_I02', /合影|照片/],
    ['EV_FIND_I04', /小册子|隐写/],
    ['EV_MEET_MONTREAL', /质询.{0,8}蒙特利尔|蒙特利尔.{0,8}关系/],
    ['EV_BARTENDER_RAT', /酒保[\s\S]{0,20}(?:老鼠|贝尔街)|(?:老鼠|贝尔街)[\s\S]{0,20}酒保/],
    ['EV_S04_CIGAR', /雪茄/],
    ['EV_CHOOSE_NEGOTIATION', /选择.{0,8}交涉|和平交涉|暂缓攻击/],
    ['EV_NEGOTIATION_LISTEN', /聆听.{0,12}诉求|理解.{0,12}诉求/],
    ['EV_NEGOTIATION_UNDERSTOOD', /聆听|声调|诉求/],
    ['EV_NEGOTIATION_SUCCESS', /说服.{0,16}(?:释放|埃里克|和平)|双方.{0,8}接受/],
    ['EV_CHOOSE_COMBAT', /选择.{0,8}战斗|立即.{0,8}战斗|攻击.{0,8}深潜者/]
  ];
  const match = mappings.find(([eventId, pattern]) => available.has(eventId) && pattern.test(text));
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
    );
    for (const item of fallback) {
      if (safe.length >= 3) break;
      if (!safe.includes(item)) safe.push(item);
    }
    return [player, safe.slice(0, 3)];
  }));
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
  if (/注射[^。；\n]{0,12}活性炭|浓盐水[^。；\n]{0,12}催吐|试喝|尝一口/.test(allText)) {
    return '不得给出危险的现实医疗处置或建议品尝未知物质';
  }
  if (/ICU|重症监护室|床旁心电监护|防化服|特警队/.test(allText)) {
    return `叙事必须符合${kb.era}，不得出现时代错误的设备或机构`;
  }
  if (/\b\d{1,2}[:：]\d{2}\b|(?:凌晨|上午|下午|晚上|夜里)\s*\d{1,2}\s*点/.test(allText)) {
    return '权威状态没有世界时钟，不得编造精确钟点';
  }
  if (/(?:抵达|到达|进入|来到|赶到)[^。；\n]{0,12}(?:医院|仓库|教堂|洞穴)/.test(output.narrative)) {
    return '不得把知识库外地点叙述为已经抵达的新主场景';
  }
  const inventedStreet = allText.match(/(?:泰晤士街|[\u4e00-\u9fff]{2,6}大街)/)?.[0];
  if (inventedStreet && inventedStreet !== '纽伦上街') {
    return `不得创造模组未声明的街道：${inventedStreet}`;
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
  if (
    targetId
    && output.activeNpc
    && !kb.scenes[targetId as SceneId]?.public.npcs.includes(output.activeNpc)
  ) {
    return `切换场景后 activeNpc 仍指向不在新场景的 ${output.activeNpc}`;
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
  }
  return null;
}
