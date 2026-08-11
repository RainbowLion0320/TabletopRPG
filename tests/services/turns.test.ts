import { describe, expect, it } from 'vitest';
import {
  countCompletedGameTurns,
  getDmRequestTurn,
  isDiceResultHistoryTurn
} from '../../src/services/turns';

describe('formal game turn counting', () => {
  it('treats dice results as subevents of the current player turn', () => {
    const history = [
      { role: 'user', content: '亨利调查书桌，艾达检查窗户。' },
      { role: 'assistant', content: '请进行侦查检定。' },
      { role: 'user', content: '【检定结果】亨利的侦查检定：普通成功。' },
      { role: 'user', content: '  【检定结果】艾达的说服检定：失败。' },
      { role: 'assistant', content: '调查仍继续推进。' },
      { role: 'user', content: '两人前往下一地点。' }
    ];

    expect(isDiceResultHistoryTurn(history[2])).toBe(true);
    expect(countCompletedGameTurns(history)).toBe(2);
  });

  it('keeps a dice continuation on the same formal turn', () => {
    expect(getDmRequestTurn([])).toBe(1);
    expect(getDmRequestTurn([
      { role: 'user', content: '第一回合行动' },
      { role: 'assistant', content: '请检定' },
      { role: 'user', content: '【检定结果】普通成功' }
    ])).toBe(1);
    expect(getDmRequestTurn([
      { role: 'user', content: '第一回合行动' },
      { role: 'assistant', content: '结算完成' }
    ])).toBe(2);
  });
});
