import { describe, expect, it } from 'vitest';
import { normalizeNarrativeKeywordHints } from '../../src/services/narrativeKeywords';

describe('normalizeNarrativeKeywordHints', () => {
  it('keeps only exact, safe, unique keywords within the limit', () => {
    const narrative = '水里的东西正在靠近，门外传来潮湿的脚步声。';
    const result = normalizeNarrativeKeywordHints([
      { text: '水里的东西', kind: 'clue' },
      { text: '水里的东西', kind: 'danger' },
      { text: '不存在的词', kind: 'clue' },
      { text: '<img src=x>', kind: 'danger' },
      { text: '调查', kind: 'clue' },
      { text: '潮湿的脚步声', kind: 'danger' },
      { text: '门外', kind: 'other' }
    ], narrative);

    expect(result).toEqual([
      { text: '水里的东西', kind: 'clue' },
      { text: '潮湿的脚步声', kind: 'danger' }
    ]);
  });

  it('drops sentence-like hints over twelve characters and caps output at six entries', () => {
    const words = ['甲一', '乙二', '丙三', '丁四', '戊五', '己六', '庚七'];
    const narrative = `${words.join('，')}，${'很'.repeat(13)}`;
    const result = normalizeNarrativeKeywordHints([
      ...words.map((text) => ({ text, kind: 'state' })),
      { text: '很'.repeat(13), kind: 'state' }
    ], narrative);

    expect(result.map((item) => item.text)).toEqual(words.slice(0, 6));
  });

  it('rejects full-sentence transient highlights observed during real play', () => {
    const narrative = '船缆仍未解开，但锅炉的汽笛已经嘶鸣起来。';

    expect(normalizeNarrativeKeywordHints([{
      text: '船缆仍未解开，但锅炉的汽笛已经嘶鸣', kind: 'state'
    }], narrative)).toEqual([]);
  });
});
