export const COMBAT_ACTION_RE = /攻击(?!机会|结果|计划|路线|意图|准备)|迎击|反击|袭击|搏斗|出拳|挥拳|制服|击败|打倒|殴打|近战|射击|开枪|开火|擒抱|摔倒|猛击|重击|痛击|击打|打击|击向|挥击|挥砍|挥棍|砸向|砸击|横扫|劈向|劈下|刺向|砍向|踢向|踹向/;

function matchIsDeferred(text: string, index: number): boolean {
  const clausePrefix = text.slice(0, index).split(/[，。；！？\n]/).pop() ?? '';
  const prepared = /(?:准备|预备|打算|计划|等待|等候|留待)[^，。；！？\n]{0,24}$/.test(clausePrefix);
  const startsImmediatelyAfterPreparation = /准备好[^，。；！？\n]{0,12}后(?:立即|马上|随即|开始|尝试)?[^，。；！？\n]{0,4}$/.test(clausePrefix);
  if (prepared && !startsImmediatelyAfterPreparation) return true;
  return /(?:如果|若|一旦|等到|待到|当)[^，。；！？\n]{0,24}(?:时|后|就|再|才)[^，。；！？\n]{0,6}$/.test(clausePrefix);
}

export function hasAffirmativeMatch(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(matcher)) {
    if (matchIsDeferred(text, match.index ?? 0)) continue;
    const prefix = text.slice(0, match.index ?? 0).slice(-20);
    if (/不得不[^，。；！？\n]{0,4}$/.test(prefix)) return true;
    if (/(?:询问|追问|问|确认|说明|调查|判断|回忆|是否|有没有|有无|曾否|是不是|是不是曾)[^，。；！？\n]{0,10}$/.test(prefix)) {
      continue;
    }
    if (/(?:不|未|没有|并未|并不|不要|不再|暂不|暂缓|停止|避免|放弃|拒绝|无意|不想)[^，。；！？\n]{0,12}$/.test(prefix)) {
      continue;
    }
    return true;
  }
  return false;
}

export function isAffirmativeCombatAction(text: string): boolean {
  return hasAffirmativeMatch(text, COMBAT_ACTION_RE);
}
