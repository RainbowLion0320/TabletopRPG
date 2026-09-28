import { describe, expect, it } from 'vitest';
import { isPlayerVisibleMessage, pendingDmFailureText } from '../../src/services/narrativeVisibility';
import { gameReducer } from '../../src/state/gameReducer';
import { makeState } from '../dm/fixtures';

describe('DM failures remain temporary and do not leak diagnostics', () => {
  it('hides old validator messages and displays a safe recovery explanation', () => {
    const message = { id: 'old', type: 'system' as const, text: 'AI DM 返回格式无效：未解锁地点：贝尔街14号 request_check' };
    expect(isPlayerVisibleMessage(message)).toBe(false);
    expect(pendingDmFailureText([message])).not.toMatch(/贝尔街|request_check|格式/);
    expect(pendingDmFailureText([message])).toContain('已确认的骰点无需重掷');
  });
  it('replaces repeated errors and clears them on successful narration', () => {
    let state = makeState();
    for (const text of ['AI DM 返回格式无效：内部错误', 'AI DM 连接失败：网络不可用']) {
      state = gameReducer(state, { type: 'appendMessage', message: { type: 'system', text } });
    }
    expect(state.messages.filter((m) => m.text.startsWith('AI DM'))).toHaveLength(1);
    expect(pendingDmFailureText(state.messages)).toContain('检查网络');
    state = gameReducer(state, { type: 'appendMessage', message: { type: 'dm', text: '你的行动改变了局面。' } });
    expect(pendingDmFailureText(state.messages)).toBeNull();
    expect(isPlayerVisibleMessage({ type: 'system', text: '检定结果：普通成功（42）' })).toBe(true);
  });

  it.each([
    ['HTTP 401：secret prompt sk-example 贝尔街14号', '认证失败'],
    ['HTTP 429：request_check request body', '请求受限'],
    ['HTTP 503：private provider trace', '模型服务暂时异常'],
    ['TypeError：secret prompt sk-example 贝尔街14号', '检查网络']
  ])('keeps actionable hints and strips raw provider data: %s', (detail, hint) => {
    const message = { id: 'old-provider', type: 'system' as const, text: `AI DM 连接失败：${detail}` };
    expect(isPlayerVisibleMessage(message)).toBe(false);
    const text = pendingDmFailureText([message]);
    expect(text).toContain(hint);
    expect(text).not.toMatch(/HTTP|secret|sk-example|贝尔街|request_check|provider|TypeError/);
  });
});
