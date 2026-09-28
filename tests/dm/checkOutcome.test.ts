import { describe, expect, it } from 'vitest';
import { contradictsSettledCheck } from '../../src/dm/checkOutcome';
import type { PlayerAction } from '../../src/services/aiDm';

const failed: PlayerAction = {
  player: '亨利·格雷', action: '【检定结果】亨利·格雷 的 潜行 检定：掷出 90，结果：失败（90）。',
  checkResult: { skill: '潜行', outcome: 'fail' }
};
const passed: PlayerAction = {
  player: '艾达·华莱士', action: '【检定结果】艾达·华莱士 的 侦查 检定：掷出 10，结果：困难成功（10）。',
  checkResult: { skill: '侦查', outcome: 'hard' }
};

describe('settled check assertions', () => {
  it.each([
    '潜行检定没有通过，你停下了脚步。', '潜行检定未能成功，你的脚步声惊动了对方。',
    '这次潜行检定并未成功。', '你未能通过潜行检定。', '你没有成功通过这次潜行检定。',
    '潜行检定失败，你成功退回了走廊。', '如果下次潜行检定成功，你可以悄悄离开。'
  ])('accepts truthful failed dice or a hypothetical: %s', (narrative) => {
    expect(contradictsSettledCheck(narrative, [failed])).toBeNull();
  });

  it.each(['潜行检定成功。', '你成功通过潜行检定。', '潜行检定没有失败。'])('blocks an actual contradiction: %s', (narrative) => {
    expect(contradictsSettledCheck(narrative, [failed])).toContain('失败检定改写为成功');
  });

  it('handles double negatives, short names, punctuation and independent mixed outcomes', () => {
    expect(contradictsSettledCheck('艾达的侦查检定并未失败。', [passed])).toBeNull();
    expect(contradictsSettledCheck('亨利的潜行检定没有通过，艾达的侦查检定成功。', [failed, passed])).toBeNull();
    expect(contradictsSettledCheck('亨利的潜行检定成功，艾达的侦查检定成功。', [failed, passed])).toContain('失败检定');
    expect(contradictsSettledCheck('亨利的潜行检定没有通过，艾达的侦查检定未能成功。', [failed, passed])).toContain('成功检定改写为失败');
  });

  it('matches multiple skills for one player and still reads older saved results', () => {
    const samePlayer = { ...passed, player: failed.player };
    expect(contradictsSettledCheck('亨利的潜行检定没有通过，侦查检定成功。', [failed, samePlayer])).toBeNull();
    expect(contradictsSettledCheck('亨利的潜行检定失败，侦查检定未能成功。', [failed, samePlayer])).toContain('成功检定');
    expect(contradictsSettledCheck('潜行检定没有通过。', [{ ...failed, checkResult: undefined }])).toBeNull();
  });
});
