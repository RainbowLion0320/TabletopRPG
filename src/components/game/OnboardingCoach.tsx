import { useCallback, useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '../../types/game';
import { attachDialogCompanion } from '../shared/useDialogFocus';
import { useOnboardingFocus, type FocusTarget } from './onboardingFocus';
import './onboarding.css';

interface OnboardingCoachProps {
  state: GameState;
  dicePhase?: 'rolling' | 'revealed';
  drawerOpen: boolean;
  characterOpen: boolean;
  menuOpen: boolean;
  blocked: boolean;
  onFinish: (status: 'done' | 'skipped') => void;
}

/** A short cue beside the real control; the artwork never captures its tap. */
export function OnboardingCoach({ state, dicePhase, drawerOpen, characterOpen, menuOpen, blocked, onFinish }: OnboardingCoachProps) {
  const step = state.onboarding!.step;
  const filled = Boolean(state.declarations[state.players[state.currentActorIndex]?.id]?.trim());
  const inspectedPhoto = useRef(false);
  const previousStep = useRef(step);
  if (previousStep.current !== step) { inspectedPhoto.current = false; previousStep.current = step; }
  const resolve = useCallback((): FocusTarget | null => {
    if (blocked) return null;
    const find = (selector: string, text: string): FocusTarget | null => {
      const element = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .find(control => !control.closest('[inert], [aria-hidden="true"]') && control.getBoundingClientRect().width > 0);
      return element ? { element, text } : null;
    };
    if (step === 'action' || step === 'search') {
      if (drawerOpen || characterOpen || menuOpen) return null;
      return filled ? find('.dock-submit:enabled', state.currentActorIndex < state.players.length - 1 ? '交给下一位' : '确认行动')
        : find('.suggestion-row > button:first-child', step === 'search' ? '选择调查行动' : '点这里选择行动');
    }
    if (step === 'roll') {
      if (drawerOpen || characterOpen || menuOpen || dicePhase === 'rolling') return null;
      return dicePhase === 'revealed' ? find('.dice-roll-confirm', '确认结果，继续调查')
        : find('.check-card > button:enabled', '点这里掷骰');
    }
    if (step === 'records') {
      if (characterOpen || menuOpen) return null;
      if (!drawerOpen) return find('.drawer-tab', '线索收在这里');
      const detail = find('.case-board-inspector[role="dialog"] [aria-label="关闭资料详情"]', '看完返回调查');
      if (detail) { inspectedPhoto.current = true; return detail; }
      return inspectedPhoto.current || !document.querySelector('.info-drawer-tabs [aria-selected="true"][id$="-board"]')
        ? find('[aria-label="关闭资料"]', '返回调查')
        : find('button[aria-label="物证 合影照片"]', '点开这条线索');
    }
    if (step === 'character') {
      if (drawerOpen || menuOpen) return null;
      if (!characterOpen) return find('.dock-actor-avatar', '点头像查看属性');
      return document.querySelector('.investigator-tabs [aria-selected="true"][id$="-overview"]')
        ? find('.investigator-tabs [id$="-skills"]', '这里查看技能')
        : find('.investigator-close', '返回调查');
    }
    if (step === 'finish') {
      if (drawerOpen || characterOpen) return null;
      return menuOpen ? find('.game-menu .menu-list > button:first-child', '保存这次调查')
        : find('.menu-button', '菜单里可以保存');
    }
    return null;
  }, [step, filled, state.currentActorIndex, state.players.length, dicePhase, drawerOpen, characterOpen, menuOpen, blocked]);
  const bubbleRef = useRef<HTMLElement>(null);
  const focus = useOnboardingFocus(resolve, bubbleRef);
  const id = useId();
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!focus || !bubble) return;
    const target = focus.element;
    const originalDescription = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [originalDescription, id].filter(Boolean).join(' '));
    const owner = target.closest<HTMLElement>('[role="dialog"]');
    const release = owner ? attachDialogCompanion(owner, bubble) : undefined;
    return () => {
      release?.();
      if (originalDescription === null) target.removeAttribute('aria-describedby');
      else target.setAttribute('aria-describedby', originalDescription);
    };
  }, [focus?.element, id]);
  if (!focus) return null;
  const { rect, bubble, hand } = focus;
  return createPortal(<div className="onboarding-focus-layer" data-onboarding-target={focus.element.className}>
    <svg className="onboarding-shade" aria-hidden="true" width="100%" height="100%">
      <defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="white" />
        <rect x={rect.x - 5} y={rect.y - 5} width={rect.width + 10} height={rect.height + 10} rx="9" fill="black" />
      </mask></defs>
      <rect width="100%" height="100%" fill="#030b16" fillOpacity=".44" mask={`url(#${id}-mask)`} />
    </svg>
    <div className="onboarding-spotlight" aria-hidden="true" style={{ left: rect.x - 4, top: rect.y - 4, width: rect.width + 8, height: rect.height + 8 }} />
    <aside className="onboarding-coach" aria-label="新手调查" data-onboarding-step={step}
      data-side={bubble.side} ref={bubbleRef} style={{ left: bubble.x, top: bubble.y, '--cue-arrow': `${bubble.arrow}px` } as CSSProperties}>
      <span id={id} className="onboarding-cue" role="status" aria-live="polite" aria-atomic="true">{focus.text}</span>
      <button type="button" className="onboarding-dismiss" onClick={() => onFinish(step === 'finish' ? 'done' : 'skipped')}>
        {step === 'finish' ? '完成' : '跳过'}
      </button>
    </aside>
    <span className="onboarding-hand" aria-hidden="true" style={{ left: hand.x - 12, top: hand.y - 4 }}>
      <svg viewBox="0 0 40 48" width="40" height="48">
        <defs><linearGradient id={`${id}-glove`} x2=".8" y2="1"><stop stopColor="#fff6dc"/><stop offset="1" stopColor="#c5d9ec"/></linearGradient></defs>
        <circle className="onboarding-tap" cx="12" cy="4" r="8" fill="none" stroke="#e7ca8e" strokeWidth="1.5" />
        <path d="M9 26V6c0-5 7-5 7 0v14c3-4 7-2 7 2 4-3 7-1 7 3 4-2 7 1 6 5l-3 9c-1 3-4 5-8 5h-9c-3-1-6-4-8-7L3 29c-3-5 3-8 6-3Z" fill={`url(#${id}-glove)`} stroke="#344a60" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M16 20v7m7-5v7m7-4v6M13 39h19" fill="none" stroke="#607d98" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M14 40h18l-1 6H15Z" fill="#e0c18b" stroke="#344a60" strokeWidth="1.3" />
      </svg>
    </span>
  </div>, document.body);
}
