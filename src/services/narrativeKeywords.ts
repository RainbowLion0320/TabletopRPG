import type { NarrativeKeywordHint, NarrativeKeywordKind } from '../types/game';

const KEYWORD_KINDS = new Set<NarrativeKeywordKind>(['clue', 'danger', 'state']);
const GENERIC_KEYWORDS = new Set([
  '调查', '继续', '行动', '玩家', '调查员', '发现', '检查', '询问', '这里', '你们',
  '黏液', '粘液', '雾气', '浓雾', '毫无记录'
]);
const GENERIC_ENVIRONMENT_RE = /(?:木门|房门|大门|门口|墙壁|桌椅|灯光|窗户)$/;
const EVIDENCE_DETAIL_RE = /刮痕|血迹|脚印|指纹|纤维|暗号|异常|破坏|撞开|撬|门锁|锁孔/;
const TRANSIENT_ENVIRONMENT_RE = /^(?:(?:前门|后门|侧门|房门|大门|窗户).{0,6}(?:半掩|敞开|关闭|打开)|(?:陈腐|潮湿|刺鼻|腥咸|浓烈|淡淡|微弱).{0,6}(?:气味|药味|霉味|光线|灯光))$/;
const TRANSIENT_REACTION_RE = /^(?:指尖|手指|目光|视线|眼神|眉头|嘴角|呼吸|脚步|动作).{0,7}(?:一顿|停顿|收紧|闪烁|游移|颤抖|颤了一下|皱起|抿紧)$/;
const APPEARANCE_DESCRIPTOR_RE = /^(?=.{2,12}$)(?:(?:灰绿|青灰|惨白|苍白|黝黑|暗红|湿润|潮湿|粗糙|光滑|布满|覆盖|泛着).{0,5})?(?:皮肤|肤色|鳞片|面孔|脸庞|双眼|眼睛|手掌|手指|手臂|头发|毛发)$/;
const CONVERSATIONAL_CLAIM_RE = /^(?:(?:没有|没必要|无需|不值得).{0,10}(?:搅动|调查|处理|继续|记录|写入|归档).{0,4}|(?:记不清|不记得|无法确认).{0,8}(?:日期|时间|名字|姓名|地点|去向)|(?:正常|既定|常规).{0,8}(?:流程|程序).{0,6}(?:处理|结案).{0,2}|卷宗.{0,8}(?:归档|保存|调走).{0,6})$/;
const TEMPORAL_EXPRESSION_RE = /^(?:(?:\d{1,4}年)?\d{1,2}月\d{1,2}日(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?|(?:今天|昨日|昨天|前天|明天|当日|次日|几天前|(?:\d{1,2}|[一二三四五六七八九十两几])天前)(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?|(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜))$/;

export const MAX_NARRATIVE_KEYWORDS = 6;
export const MAX_NARRATIVE_KEYWORD_LENGTH = 12;

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
    if (TRANSIENT_ENVIRONMENT_RE.test(text) && !EVIDENCE_DETAIL_RE.test(text)) continue;
    if (TRANSIENT_REACTION_RE.test(text) && !EVIDENCE_DETAIL_RE.test(text)) continue;
    if (APPEARANCE_DESCRIPTOR_RE.test(text) && !EVIDENCE_DETAIL_RE.test(text)) continue;
    if (CONVERSATIONAL_CLAIM_RE.test(text) && !EVIDENCE_DETAIL_RE.test(text)) continue;
    if (TEMPORAL_EXPRESSION_RE.test(text)) continue;
    if (GENERIC_ENVIRONMENT_RE.test(text) && !EVIDENCE_DETAIL_RE.test(text)) continue;
    if (!KEYWORD_KINDS.has(kind as NarrativeKeywordKind)) continue;
    if (!narrative.includes(text) || seen.has(text)) continue;

    seen.add(text);
    out.push({ text, kind: kind as NarrativeKeywordKind });
    if (out.length >= MAX_NARRATIVE_KEYWORDS) break;
  }

  return out;
}
