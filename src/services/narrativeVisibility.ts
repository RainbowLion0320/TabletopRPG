import type { NarrativeMessage } from '../types/game';
import { getScenarioDefinition } from '../scenario/engine';

const normalizeCue = (text: string) => text.replace(/\s/g, '');
const authoredCues = new Set(getScenarioDefinition().progression.storyEvents
  .map((event) => normalizeCue(event.narrativeCue))
  .filter(Boolean));

function isInternalInstruction(text: string): boolean {
  return /^(?:推进提示|剧情事件)[：:]/.test(text.trim());
}

/** Older saves and an already-running page may still contain untagged DM cues. */
export function isPlayerVisibleMessage(message: Pick<NarrativeMessage, 'type' | 'text'>): boolean {
  return message.type !== 'system'
    || (!isInternalInstruction(message.text) && !authoredCues.has(normalizeCue(message.text)));
}

export function isPlayerVisibleLogEntry(entry: { text: string }): boolean {
  return !isInternalInstruction(entry.text);
}
