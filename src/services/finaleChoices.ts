import type { Investigator } from '../types/game';
import { isAffirmativeCombatAction } from './actionIntent';

const NEGOTIATION_RE = /谈判|交涉|谈条件|和平离港|交换条件|(?:听清|聆听|倾听|理解|回应)[^，。；！？\n]{0,16}(?:诉求|条件)/;
const PREMATURE_RESCUE_RE = /救出埃里克|释放埃里克|(?:解开|割断|剪断|挣脱)[^，。；！？\n]{0,16}(?:绳|束缚|绑缚)|(?:带|护送|扶着|搀扶)[^，。；！？\n]{0,12}埃里克[^，。；！？\n]{0,12}(?:离开|撤离|下船|码头)/;

export function isFinaleChoiceCompatible(
  choice: string,
  route: unknown,
  remainingOpponents: number,
  canAttack: boolean | null = null
): boolean {
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
          '守住掩体侧翼，阻止深潜者包抄同伴',
          '观察敌人位置并配合同伴发动下一次攻击'
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
      '先确认埃里克的处境，再明确选择战斗或交涉'
    ]];
  }));
}

export function finaleSuggestionsNeedReplacement(
  players: Investigator[],
  suggestionsByPlayerId: Record<string, string[]>,
  route: unknown,
  remainingOpponents: number
): boolean {
  if (route !== 'combat' && route !== 'negotiation') return false;
  return players.some((player) => {
    const suggestions = suggestionsByPlayerId[player.id] ?? [];
    const canAttack = (player.equipment ?? []).some((item) => /手枪|左轮枪|警棍|棍|刀|武器/.test(item));
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
