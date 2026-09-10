import type { GameState } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import type { DmToolCall } from './types';
import { getScenarioDefinition } from '../scenario/engine';

/** Current instructions only: negations, future options and past results are not rolls. */
export function demandedCheckClauses(text: string): string[] {
  return text.split(/[。；！？\n]/).filter((clause) => {
    const request = /(?:需要|必须|务必|须得|请)[^。；！？\n]{0,40}(?:检定|掷骰)/.exec(clause);
    if (!request) return false;
    const prefix = clause.slice(0, request.index);
    if (/(?:不|无|不再|不用|不必|无需|毋须|未必|不一定|不太|可能)\s*$/.test(prefix)) return false;
    if (/(?:如果|假如|若(?:要|想|是)|一旦|以后|之后再|下次)[^。；！？\n]*$/.test(prefix)) return false;
    if (/(?:刚才|之前|此前|上一轮|上次)[^，。；！？\n]*$/.test(prefix)) return false;
    return true;
  });
}

/** Bridge an unambiguous DM instruction to the existing, Director-validated dice tool.
 * Never choose a skill for the DM, resolve a die, or replace an explicit tool call. */
export function recoverNarratedChecks(
  output: { narrative: string; nextPrompt: string },
  calls: DmToolCall[],
  state: GameState,
  actions: PlayerAction[]
): DmToolCall[] {
  if (calls.some((call) => call.name === 'request_check')
    || actions.some((action) => action.checkResult || /【检定结果】/.test(action.action))) return [];
  // An authored event may itself open a dice request after the reducer applies it.
  // Adding a generic request here would duplicate or displace that scenario check.
  if (calls.some((call) => call.name === 'propose_story_event'
    && getScenarioDefinition().progression.storyEvents.some((event) => event.id === call.arguments.eventId
      && event.effects.some((effect) => 'requestCheck' in effect)))) return [];
  const actors = state.players.filter((player) => actions.some((action) => action.player === player.name));
  const recovered: DmToolCall[] = [];
  for (const clause of demandedCheckClauses(`${output.narrative}\n${output.nextPrompt}`)) {
    const named = state.players.filter((player) => {
      const shortName = player.name.split('·')[0];
      return clause.includes(player.name) || (shortName.length >= 2 && clause.includes(shortName));
    });
    const player = named.length === 1 ? named[0] : !named.length && actors.length === 1 ? actors[0] : null;
    if (!player || !actors.includes(player)) continue;
    const skills = [...new Set([
      ...Object.keys(player.skills), '力量', '体质', '体型', '敏捷', '外貌', '智力', '意志', '教育', '幸运', '理智', 'SAN'
    ])].filter((skill) => clause.includes(skill));
    const specificSkills = skills.filter((skill) => !skills.some((other) => other !== skill && other.includes(skill)));
    if (specificSkills.length !== 1 || /或者|二选一|或(?:是)?/.test(clause)) continue;
    const skill = specificSkills[0];
    const difficulty = clause.includes('极难') ? '极难' : clause.includes('困难') ? '困难' : '普通';
    if (recovered.some((call) => call.arguments.player === player.name && call.arguments.skill === skill)) continue;
    recovered.push({ name: 'request_check', arguments: {
      player: player.name, skill, difficulty, reason: '按 DM 本轮明确要求进行检定'
    } });
  }
  return recovered;
}
