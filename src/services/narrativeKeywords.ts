import type { NarrativeKeywordHint, NarrativeKeywordKind } from '../types/game';

const KEYWORD_KINDS = new Set<NarrativeKeywordKind>(['clue', 'danger', 'state']);
const GENERIC_KEYWORDS = new Set([
  '调查', '继续', '行动', '玩家', '调查员', '发现', '检查', '询问', '这里', '你们'
]);

export const MAX_NARRATIVE_KEYWORDS = 6;
export const MAX_NARRATIVE_KEYWORD_LENGTH = 24;

export function normalizeNarrativeKeywordHints(
  value: unknown,
  narrative: string
): NarrativeKeywordHint[] {
  if (!Array.isArray(value) || !narrative) return [];
  const out: NarrativeKeywordHint[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const text = typeof source.text === 'string' ? source.text.trim() : '';
    const kind = source.kind;
    if (text.length < 2 || text.length > MAX_NARRATIVE_KEYWORD_LENGTH) continue;
    if (/[<>]/.test(text) || GENERIC_KEYWORDS.has(text)) continue;
    if (!KEYWORD_KINDS.has(kind as NarrativeKeywordKind)) continue;
    if (!narrative.includes(text) || seen.has(text)) continue;

    seen.add(text);
    out.push({ text, kind: kind as NarrativeKeywordKind });
    if (out.length >= MAX_NARRATIVE_KEYWORDS) break;
  }

  return out;
}
