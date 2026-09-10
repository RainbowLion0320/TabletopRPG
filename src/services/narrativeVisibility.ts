import type { NarrativeMessage } from '../types/game';
import { getScenarioDefinition } from '../scenario/engine';

const normalizeCue = (text: string) => text.replace(/\s/g, '');
const authoredCues = new Set(getScenarioDefinition().progression.storyEvents
  .map((event) => normalizeCue(event.narrativeCue))
  .filter(Boolean));

function isInternalInstruction(text: string): boolean {
  return /^(?:推进提示|剧情事件)[：:]/.test(text.trim());
}

export function isDmFailureMessage(message: Pick<NarrativeMessage, 'type' | 'text'>): boolean {
  return message.type === 'system' && /^AI DM (?:返回格式无效|连接失败|连接超时)[：:]/.test(message.text.trim());
}

/** Never reveal validator diagnostics (including unrevealed names) to the player. */
export function pendingDmFailureText(messages: NarrativeMessage[]): string | null {
  const latest = [...messages].reverse().find(isDmFailureMessage);
  if (!latest) return null;
  return /^AI DM 返回格式无效[：:]/.test(latest.text.trim())
    ? 'DM 暂时未能完成本轮回应，请重试。行动和已确认的骰点都已保留。'
    : latest.text;
}

/** Older saves and an already-running page may still contain untagged DM cues. */
export function isPlayerVisibleMessage(message: Pick<NarrativeMessage, 'type' | 'text'>): boolean {
  return message.type !== 'system'
    || (!isDmFailureMessage(message) && !isInternalInstruction(message.text) && !authoredCues.has(normalizeCue(message.text)));
}

export function isPlayerVisibleLogEntry(entry: { text: string }): boolean {
  return !isInternalInstruction(entry.text) && !isDmFailureMessage({ type: 'system', text: entry.text });
}
