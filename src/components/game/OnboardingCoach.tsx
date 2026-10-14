import actionPen from '../../../assets/ui/artist/action-pen.webp';
import type { GameState } from '../../types/game';
import { isOnboardingActive } from '../../services/onboarding';
import './onboarding.css';

interface OnboardingCoachProps {
  state: GameState;
  onFinish: (status: 'done' | 'skipped') => void;
}

export function OnboardingCoach({ state, onFinish }: OnboardingCoachProps) {
  if (!isOnboardingActive(state)) return null;
  const step = state.onboarding!.step;
  const actor = state.players[state.currentActorIndex];
  const filled = Boolean(actor && state.declarations[actor.id]?.trim());
  const submit = state.currentActorIndex < state.players.length - 1 ? '下一位' : '提交';
  const copy = {
    action: [1, '写下第一个行动', filled
      ? `点「${submit}」确认。${state.players.length > 1 ? '大家依次行动，最后一起结算。' : '伊莎贝拉会回应你的选择。'}`
      : '轻点下面的建议，把接受委托的行动填入输入框。'],
    search: [2, '调查身边的痕迹', filled
      ? `点「${submit}」确认，试着搜查书房。`
      : '这一轮检查书桌。轻点建议，再确认每位调查员的行动。'],
    roll: [3, '掷骰决定结果', '点「掷骰」进行侦查。点数不超过目标值就成功，失手也能继续。'],
    records: [4, '留住第一条线索', '点书本图标打开资料。合影已收入案件板，点卡片可查看详情。'],
    character: [5, '认识你的调查员', '点输入框左侧的头像，查看属性、技能和随身物品。'],
    finish: [6, '开始你的自由调查', '右上菜单可以保存、读档和调整声音。现在也可自己输入想做的事。'],
    done: [], skipped: []
  }[step];
  return <aside className="onboarding-coach" aria-label="新手调查" data-onboarding-step={step}>
    <img src={actionPen} width={22} height={22} alt="" aria-hidden="true" />
    <div className="onboarding-copy">
      <span className="onboarding-caption">初次调查 · {copy[0]}/6</span>
      <strong>{copy[1]}</strong>
      <p id="first-investigation-tip" aria-live="polite" aria-atomic="true">{copy[2]}</p>
    </div>
    <button type="button" className="onboarding-dismiss" onClick={() => onFinish(step === 'finish' ? 'done' : 'skipped')}>
      {step === 'finish' ? '开始调查' : '跳过引导'}
    </button>
  </aside>;
}
