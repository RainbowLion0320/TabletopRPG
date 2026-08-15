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

  it('drops decorative architecture but keeps physical evidence on it', () => {
    const narrative = '漆皮剥落的木门透出灯光，锁孔旁的新鲜刮痕值得检查。';

    expect(normalizeNarrativeKeywordHints([
      { text: '漆皮剥落的木门', kind: 'clue' },
      { text: '锁孔旁的新鲜刮痕', kind: 'clue' }
    ], narrative)).toEqual([
      { text: '锁孔旁的新鲜刮痕', kind: 'clue' }
    ]);
  });

  it('drops generic atmosphere and residue words that are not authored entities', () => {
    const narrative = '浓雾卷过栈桥，警棍上沾着黏液。';

    expect(normalizeNarrativeKeywordHints([
      { text: '浓雾', kind: 'state' },
      { text: '黏液', kind: 'clue' }
    ], narrative)).toEqual([]);
  });

  it('drops transient prose fragments that should not become entity buttons', () => {
    const narrative = '办公室里毫无记录，后门半掩，空气中残留着陈腐药味。';

    expect(normalizeNarrativeKeywordHints([
      { text: '毫无记录', kind: 'clue' },
      { text: '后门半掩', kind: 'clue' },
      { text: '陈腐药味', kind: 'clue' }
    ], narrative)).toEqual([]);
  });

  it('drops fleeting npc reactions that are prose rather than durable state', () => {
    const narrative = '蒙特利尔翻看合影，指尖微微一顿，目光短暂停顿，随即把照片推回桌上。';

    expect(normalizeNarrativeKeywordHints([
      { text: '指尖微微一顿', kind: 'state' },
      { text: '目光短暂停顿', kind: 'clue' }
    ], narrative)).toEqual([]);
  });
});
