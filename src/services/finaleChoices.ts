import type { Investigator } from '../types/game';
import { isAffirmativeCombatAction } from './actionIntent';

const NEGOTIATION_RE = /谈判|交涉|谈条件|和平离港|交换条件|(?:听清|聆听|倾听|理解|回应)[^，。；！？\n]{0,16}(?:诉求|条件)/;
const COMBAT_ROUTE_RE = /(?:选择|决定|明确)[^，。；！？\n]{0,12}(?:武力|战斗)|(?:以|使用|采取)[^，。；！？\n]{0,6}武力[^，。；！？\n]{0,16}(?:阻止|拦截|对抗)/;
const PREMATURE_RESCUE_RE = /救出埃里克|释放埃里克|(?:冲向|奔向|跑向|扑向|爬向|走向|赶到|移动到|移动至)[^，。；！？\n]{0,20}埃里克(?![^，。；！？\n]{0,12}(?:深潜者|守卫|看守|混种))|(?:冲向|奔向|靠近)[^，。；！？\n]{0,12}埃里克[^，。；！？\n]{0,12}(?:解救|营救|救援)|埃里克[^。；！？\n]{0,40}(?:解救|营救|救援)(?:他)?|(?:解救|营救|救援)[^，。；！？\n]{0,12}埃里克|解绳|(?:解开|割断|剪断|挣脱)[^，。；！？\n]{0,16}(?:绳|束缚|绑缚)|(?:带|护送|扶着|搀扶)[^，。；！？\n]{0,12}埃里克[^，。；！？\n]{0,12}(?:离开|撤离|下船|码头)/;
const ROUTE_META_INSTRUCTION_RE = /(?:选择|决定|明确)[^，。；！？\n]{0,24}(?:战斗|武力|阻止深潜者)[^，。；！？\n]{0,16}(?:或|还是)[^，。；！？\n]{0,16}(?:交涉|谈判)|(?:选择|决定|明确)[^，。；！？\n]{0,24}(?:交涉|谈判)[^，。；！？\n]{0,16}(?:或|还是)[^，。；！？\n]{0,16}(?:战斗|武力)/;

export function investigatorCanAttack(player: Investigator): boolean {
  const hasWeapon = (player.equipment ?? [])
    .some((item) => /手枪|左轮枪|步枪|警棍|棍|刀|武器/.test(item));
  const brawl = player.skills?.['格斗（拳）'];
  return hasWeapon || Boolean(brawl && brawl.added > 0);
}

export function isFinaleChoiceCompatible(
  choice: string,
  route: unknown,
  remainingOpponents: number,
  canAttack: boolean | null = null
): boolean {
  if (route !== 'combat' && route !== 'negotiation' && ROUTE_META_INSTRUCTION_RE.test(choice)) {
    return false;
  }
  if (route === 'combat') {
    if (NEGOTIATION_RE.test(choice)) return false;
    if (remainingOpponents > 0) {
      if (PREMATURE_RESCUE_RE.test(choice)) return false;
      const attacks = isAffirmativeCombatAction(choice);
      return canAttack === false ? !attacks : attacks;
    }
    return !isAffirmativeCombatAction(choice);
  }
  if (route === 'negotiation') return !isAffirmativeCombatAction(choice);
  return true;
}

export function buildFinaleSuggestions(
  players: Investigator[],
  route: unknown,
  remainingOpponents: number
): Record<string, string[]> {
  return Object.fromEntries(players.map((player) => {
    if (route === 'combat' && remainingOpponents <= 0) {
      return [player.id, [
        '确认甲板威胁解除后进入船舱寻找埃里克',
        '警戒船舱入口，掩护同伴营救埃里克',
        '找到埃里克并检查伤势，尽快带他离船'
      ]];
    }
    if (route === 'combat') {
      const equipment = player.equipment ?? [];
      const hasHandgun = equipment.some((item) => /手枪|左轮枪/.test(item));
      const hasMeleeWeapon = equipment.some((item) => /警棍|棍|刀|武器/.test(item));
      if (hasHandgun) {
        return [player.id, [
          '使用随身手枪攻击一名仍在抵抗的深潜者',
          hasMeleeWeapon
            ? '拔出随身近战武器攻击逼近的深潜者'
            : '寻找稳定掩护，瞄准并射击仍在抵抗的深潜者',
          '从掩体后瞄准一名仍在抵抗的深潜者开枪'
        ]];
      }
      if (hasMeleeWeapon) {
        return [player.id, [
          '挥动随身武器攻击一名仍在抵抗的深潜者',
          '守住掩体侧翼，挥击试图包抄同伴的深潜者',
          '配合同伴从侧面攻击一名仍在抵抗的深潜者'
        ]];
      }
      if (investigatorCanAttack(player)) {
        return [player.id, [
          '以徒手格斗攻击一名仍在抵抗的深潜者',
          '利用掩体接近，从侧面挥拳攻击深潜者',
          '抓住机会擒抱一名深潜者，阻止它靠近埃里克'
        ]];
      }
      return [player.id, [
        '寻找掩护观察仍在抵抗的深潜者',
        '向同伴报告敌人位置并留意侧翼',
        '准备急救用品，等待安全的救援机会'
      ]];
    }
    if (route === 'negotiation') {
      return [player.id, [
        '保持距离，聆听深潜者代表真正的诉求',
        '尝试理解深潜者的条件，再决定如何回应',
        '请同伴警戒，自己专注辨认深潜者的非人声调'
      ]];
    }
    return [player.id, [
      '选择暂缓攻击，与深潜者代表进行交涉',
      '选择以武力阻止深潜者带走埃里克',
      '观察埃里克、交涉代表和甲板守卫的当前状态'
    ]];
  }));
}

export function finaleSuggestionsNeedReplacement(
  players: Investigator[],
  suggestionsByPlayerId: Record<string, string[]>,
  route: unknown,
  remainingOpponents: number
): boolean {
  if (route !== 'combat' && route !== 'negotiation') {
    return players.some((player) => {
      const suggestions = suggestionsByPlayerId[player.id] ?? [];
      if (suggestions.length < 3) return true;
      const hasNegotiationRoute = suggestions.some((choice) => NEGOTIATION_RE.test(choice));
      const hasCombatRoute = suggestions.some((choice) =>
        COMBAT_ROUTE_RE.test(choice) || isAffirmativeCombatAction(choice)
      );
      return !hasNegotiationRoute || !hasCombatRoute;
    });
  }
  return players.some((player) => {
    const suggestions = suggestionsByPlayerId[player.id] ?? [];
    const canAttack = investigatorCanAttack(player);
    if (suggestions.length < 3
      || suggestions.some((choice) => !isFinaleChoiceCompatible(
        choice,
        route,
        remainingOpponents,
        canAttack
      ))) {
      return true;
    }
    return route === 'combat'
      && remainingOpponents > 0
      && !canAttack
      && suggestions.every(isAffirmativeCombatAction);
  });
}
