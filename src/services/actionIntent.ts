export const COMBAT_ACTION_RE = /攻击(?!机会|结果|计划|路线|意图|准备)|搏斗|出拳|制服|击败|殴打|近战|射击|开枪|擒抱|摔倒|猛击|砸向|砸击|横扫|劈向|劈下|刺向|砍向/;

export function hasAffirmativeMatch(text: string, pattern: RegExp): boolean {
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

export function isAffirmativeCombatAction(text: string): boolean {
  return hasAffirmativeMatch(text, COMBAT_ACTION_RE);
}
