import type { NarrativeMessage } from '../types/game';
import { getScenarioDefinition } from '../scenario/engine';
import { AiHttpError, aiHttpHint } from '../dm/llm/errors';

const normalizeCue = (text: string) => text.replace(/\s/g, '');
const authoredCues = new Set(getScenarioDefinition().progression.storyEvents
  .map((event) => normalizeCue(event.narrativeCue))
  .filter(Boolean));

function isInternalInstruction(text: string): boolean {
  return /^(?:(?:推进提示|剧情事件)[：:]|请补全 AI DM 配置[：:]|请先在菜单中配置 AI API Key)/.test(text.trim());
}

const CONNECTION_HINT = '暂时无法连接 DM，请检查网络或 AI 设置后重试。';

export function dmConnectionFailureText(error: unknown): string {
  return error instanceof AiHttpError ? aiHttpHint(error.status) : CONNECTION_HINT;
}

export function isDmFailureMessage(message: Pick<NarrativeMessage, 'type' | 'text'>): boolean {
  return message.type === 'system' && /^AI DM (?:返回格式无效|连接失败|连接超时)[：:]/.test(message.text.trim());
}

/** Never reveal validator diagnostics (including unrevealed names) to the player. */
export function pendingDmFailureText(messages: NarrativeMessage[]): string | null {
  const latest = [...messages].reverse().find(isDmFailureMessage);
  if (!latest) return null;
  if (/^AI DM 返回格式无效[：:]/.test(latest.text.trim())) {
    return 'DM 暂时未能完成回应，请重试。已确认的骰点无需重掷。';
  }
  if (/^AI DM 连接超时[：:]/.test(latest.text.trim())) return 'DM 回应超时，请稍后重试。';
  // Old saves can contain full provider errors, including echoed requests.
  // Recover only our known hint; never display the provider's original text.
  const status = /HTTP\s+(\d{3})/.exec(latest.text)?.[1];
  if (status) return aiHttpHint(Number(status));
  for (const code of [401, 403, 429, 500, 400]) {
    const hint = aiHttpHint(code);
    if (latest.text.includes(hint)) return hint;
  }
  return CONNECTION_HINT;
}

/** Older saves and an already-running page may still contain untagged DM cues. */
export function isPlayerVisibleMessage(message: Pick<NarrativeMessage, 'type' | 'text'>): boolean {
  return message.type !== 'system'
    || (!isDmFailureMessage(message) && !isInternalInstruction(message.text) && !authoredCues.has(normalizeCue(message.text)));
}

export function isPlayerVisibleLogEntry(entry: { text: string }): boolean {
  return !isInternalInstruction(entry.text) && !isDmFailureMessage({ type: 'system', text: entry.text });
}
