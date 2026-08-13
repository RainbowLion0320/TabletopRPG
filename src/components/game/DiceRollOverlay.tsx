import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { DiceResult } from '../../types/game';
import type { DiceRollPresentation } from '../../app/diceRollAnimation';

interface DiceRollOverlayProps {
  onConfirm: () => void;
  roll: DiceRollPresentation | null;
}

const RESULT_TITLES: Record<DiceResult['level'], string> = {
  crit: '极难成功',
  hard: '困难成功',
  success: '普通成功',
  fail: '检定失败',
  fumble: '大失败'
};

function randomD100() {
  return Math.floor(Math.random() * 100) + 1;
}

function percentileFaces(value: number) {
  if (value === 100) return { tens: '00', ones: '0' };
  return {
    tens: String(Math.floor(value / 10) * 10).padStart(2, '0'),
    ones: String(value % 10)
  };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DiceRollOverlay({ onConfirm, roll }: DiceRollOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [displayValue, setDisplayValue] = useState(() => randomD100());

  useEffect(() => {
    if (!roll) return;
    if (roll.phase === 'revealed') confirmRef.current?.focus();
    else dialogRef.current?.focus();
  }, [roll]);

  useEffect(() => {
    if (!roll) return;
    if (roll.phase === 'revealed') {
      setDisplayValue(roll.result.roll);
      return;
    }
    if (prefersReducedMotion()) return;
    setDisplayValue(randomD100());
    const intervalId = window.setInterval(() => setDisplayValue(randomD100()), 64);
    return () => window.clearInterval(intervalId);
  }, [roll]);

  if (!roll) return null;

  const revealed = roll.phase === 'revealed';
  // The settled faces are derived directly from the authoritative result so
  // React can never paint a one-frame mismatch between the dice and the total.
  const faces = percentileFaces(revealed ? roll.result.roll : displayValue);
  const resultTitle = RESULT_TITLES[roll.result.level];

  return (
    <div
      aria-labelledby="dice-roll-title"
      aria-modal="true"
      aria-busy={!revealed}
      className={`dice-roll-overlay ${revealed ? `revealed result-${roll.result.level}` : 'rolling'}`}
      onKeyDown={(event) => {
        if (revealed && event.key === 'Escape') onConfirm();
      }}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="dice-roll-atmosphere" aria-hidden="true">
        <i /><i /><i />
      </div>
      <section className="dice-roll-card">
        <header>
          <p>D100 · PERCENTILE CHECK</p>
          <h2 id="dice-roll-title">命运检定</h2>
          <span>{roll.check.player} · {roll.check.skill}</span>
        </header>

        <div className="dice-roll-stage" aria-hidden="true">
          <div className="dice-sigil"><i /><i /></div>
          <div className="percentile-die-group tens-die">
            <div className="percentile-die"><span>{faces.tens}</span></div>
            <small>十位骰</small>
          </div>
          <div className="percentile-die-group ones-die">
            <div className="percentile-die"><span>{faces.ones}</span></div>
            <small>个位骰</small>
          </div>
        </div>

        <div className="dice-roll-readout" aria-live="assertive">
          {revealed ? (
            <>
              <strong className="dice-roll-total">{roll.result.roll}</strong>
              <div>
                <h3>{resultTitle}</h3>
                <p>结果已锁定，确认后继续结算</p>
              </div>
            </>
          ) : (
            <div className="dice-roll-pending">
              <span>骰面翻滚中</span>
              <i /><i /><i />
            </div>
          )}
        </div>

        <footer className={revealed ? 'with-confirm' : undefined}>
          <div className="dice-roll-target">
            <span>难度：{roll.check.difficulty}</span>
            <i />
            <span>目标值 {roll.check.threshold ?? '-'}</span>
          </div>
          {revealed ? (
            <button className="dice-roll-confirm" onClick={onConfirm} ref={confirmRef} type="button">
              <Check aria-hidden="true" size={16} />
              确认结果
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
