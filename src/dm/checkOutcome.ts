import type { PlayerAction } from '../services/aiDm';

const NEGATION = '(?:没有|未能|没能|并非|不是|不曾|未|没)';
const RESULT = `(?:${NEGATION})?(?:成功通过|通过|普通成功|困难成功|极难成功|大成功|成功|大失败|失败)`;

/** Read a direct assertion about a check, not a later action in the sentence. */
function assertedOutcomes(clause: string): boolean[] {
  if (/(?:如果|假如|若是|若要|一旦|可能|或许|也许)/.test(clause)) return [];
  const expressions = [
    new RegExp(`(?:检定|掷骰)(?:结果|最终|已经|已|是|为|并|也|仍|却|尚|还|[\\s：:])*(${RESULT})`, 'g'),
    new RegExp(`(${RESULT})[^，,。；！？\\n]{0,12}?(?:检定|掷骰)`, 'g')
  ];
  return expressions.flatMap((expression) => [...clause.matchAll(expression)].map((match) => {
    const negated = new RegExp(`^${NEGATION}`).test(match[1]);
    return match[1].includes('失败') ? negated : !negated;
  }));
}

/** Compare only explicit claims tied to an unambiguous settled player/skill. */
export function contradictsSettledCheck(narrative: string, actions: PlayerAction[]): string | null {
  const results = actions.flatMap((action) => {
    const level = action.checkResult?.outcome;
    const legacyOutcome = /【检定结果】[\s\S]*结果[：:]\s*([^。；！？\n]+)/.exec(action.action)?.[1];
    if (!level && (!legacyOutcome || !/成功|失败/.test(legacyOutcome))) return [];
    return [{
      player: action.player,
      skill: action.checkResult?.skill ?? /的\s*(.+?)\s*检定/.exec(action.action)?.[1],
      success: level ? level !== 'fail' && level !== 'fumble' : !legacyOutcome!.includes('失败')
    }];
  });
  const playerNames = [...new Set(results.map((result) => result.player))];
  for (const sentence of narrative.split(/[。；！？\n]/)) {
    let named: string[] = [];
    for (const clause of sentence.split(/[，,]/)) {
      const explicitNames = playerNames.filter((name) => {
        const alias = name.split('·')[0];
        return clause.includes(name) || (alias.length >= 2 && clause.includes(alias)
          && playerNames.filter((other) => other.split('·')[0] === alias).length === 1);
      });
      if (explicitNames.length) named = explicitNames;
      let applicable = named.length ? results.filter((result) => named.includes(result.player)) : results;
      const skills = applicable.filter((result) => result.skill && clause.includes(result.skill));
      if (skills.length) applicable = skills;
      const expected = [...new Set(applicable.map((result) => result.success))];
      if (expected.length !== 1) continue;
      if (assertedOutcomes(clause).some((outcome) => outcome !== expected[0])) {
        return expected[0]
          ? '正文不得把前端已经结算的成功检定改写为失败'
          : '正文不得把前端已经结算的失败检定改写为成功';
      }
    }
  }
  return null;
}
