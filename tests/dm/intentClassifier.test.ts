import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../../src/dm/intentClassifier';

function action(text: string, player = '亨利') {
  return { player, action: text } as const;
}

describe('intentClassifier', () => {
  it('returns "other" + no skills + no conflict for empty input', () => {
    const result = classifyIntent([]);
    expect(result).toEqual({ relevantSkills: [], hasConflict: false, intentKind: 'other' });
  });

  it('classifies 观察 keywords as observe and pulls 侦查/聆听', () => {
    const result = classifyIntent([action('我观察房间')]);
    expect(result.intentKind).toBe('observe');
    expect(result.relevantSkills).toEqual(expect.arrayContaining(['侦查', '聆听']));
    expect(result.hasConflict).toBe(false);
  });

  it('classifies 说服 as social and includes 说服 + 心理学', () => {
    const result = classifyIntent([action('我说服酒保告诉我消息')]);
    expect(result.intentKind).toBe('social');
    expect(result.relevantSkills).toEqual(expect.arrayContaining(['说服', '心理学']));
    expect(result.hasConflict).toBe(false);
  });

  it('marks combat keywords with conflict=true', () => {
    const result = classifyIntent([action('我对他出拳')]);
    expect(result.intentKind).toBe('combat');
    expect(result.relevantSkills).toContain('格斗（拳）');
    expect(result.hasConflict).toBe(true);
  });

  it('威胁 is social but raises conflict flag', () => {
    const result = classifyIntent([action('我威胁老板交出账本')]);
    expect(result.intentKind).toBe('social');
    expect(result.relevantSkills).toEqual(expect.arrayContaining(['恐吓', '心理学']));
    expect(result.hasConflict).toBe(true);
  });

  it('merges skills as union across multiple actions', () => {
    const result = classifyIntent([action('我搜查桌面'), action('我聆听门外动静', '艾达')]);
    expect(result.relevantSkills).toEqual(expect.arrayContaining(['侦查', '聆听']));
  });

  it('intentKind locks to first non-other hit', () => {
    // first action is observe, second is combat; intentKind should remain observe
    const result = classifyIntent([action('我搜寻地面'), action('我开枪还击', '艾达')]);
    expect(result.intentKind).toBe('observe');
    expect(result.hasConflict).toBe(true); // combat raises conflict regardless
  });

  it('case-insensitive matching is OK because dictionary is Chinese', () => {
    const result = classifyIntent([action('查阅档案库的旧报纸')]);
    expect(result.intentKind).toBe('research');
    expect(result.relevantSkills).toContain('图书馆');
  });

  it('unknown action falls back to other', () => {
    const result = classifyIntent([action('asdfqwer')]);
    expect(result.intentKind).toBe('other');
    expect(result.relevantSkills).toEqual([]);
  });
});
