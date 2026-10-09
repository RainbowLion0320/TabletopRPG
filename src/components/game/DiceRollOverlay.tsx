import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { DiceResult } from '../../types/game';
import { DICE_ROLL_DURATION_MS, type DiceRollPresentation } from '../../app/diceRollAnimation';
import { useDialogFocus } from '../shared/useDialogFocus';
import idleArt from '../../../assets/ui/dice/ui_dice_idle.webp';
import rollArt from '../../../assets/ui/dice/ui_dice_roll.webp';

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

function percentileFaces(value: number) {
  if (value === 100) return { tens: '00', ones: '0' };
  return {
    tens: String(Math.floor(value / 10) * 10).padStart(2, '0'),
    ones: String(value % 10)
  };
}

function RollingDice({ revealed }: { revealed: boolean }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <img className={`dice-roll-idle${ready && !revealed ? ' animation-ready' : ''}`} src={idleArt} alt="" draggable={false} />
      {!revealed && (
        <div className={`dice-roll-sprite${ready ? ' ready' : ''}`}>
          <img src={rollArt} alt="" draggable={false} onLoad={() => setReady(true)} onError={() => setReady(false)} />
        </div>
      )}
    </>
  );
}

export function DiceRollOverlay({ onConfirm, roll }: DiceRollOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const revealed = roll?.phase === 'revealed';
  useDialogFocus(Boolean(roll), dialogRef, () => {
    if (revealed) onConfirm();
  });

  useEffect(() => {
    if (revealed) confirmRef.current?.focus();
  }, [revealed]);

  if (!roll) return null;

  // Only the authoritative result supplies settled digits. The animation has
  // blank faces and consumes no randomness or media playback callbacks.
  const faces = percentileFaces(roll.result.roll);

  return (
    <div
      aria-labelledby="dice-roll-title"
      aria-describedby="dice-roll-context"
      aria-modal="true"
      aria-busy={!revealed}
      className={`dice-roll-overlay ${revealed ? `revealed result-${roll.result.level}` : 'rolling'}`}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
      style={{ '--dice-roll-duration': `${DICE_ROLL_DURATION_MS}ms` } as CSSProperties}
    >
      <section className="dice-roll-card">
        <header id="dice-roll-context">
          <h2 id="dice-roll-title" className="dice-roll-accessible">命运检定</h2>
          <p>{roll.check.player} · {roll.check.skill}</p>
          <div className="dice-roll-target">
            <span>难度：{roll.check.difficulty}</span>
            <span>目标值 {roll.check.threshold ?? '-'}</span>
            {(roll.check.batchTotal ?? 0) > 1 && (
              <span>第 {roll.check.batchIndex ?? 1}/{roll.check.batchTotal} 项</span>
            )}
          </div>
        </header>

        <div className="dice-roll-panel">
          <div className="dice-roll-panel-art" aria-hidden="true" />
          <p className="dice-roll-total-label">总点数</p>
          <div className="dice-roll-readout" aria-live="polite" aria-atomic="true">
            {revealed ? (
              <>
                <strong className="dice-roll-total">{roll.result.roll}</strong>
                <span className="dice-roll-accessible">{RESULT_TITLES[roll.result.level]}</span>
              </>
            ) : <span className="dice-roll-unsettled" aria-hidden="true">···</span>}
          </div>

          <div className="dice-roll-stage" aria-hidden="true">
            <RollingDice revealed={revealed} />
            {revealed && (
              <>
                <span className="dice-face tens-die">{faces.tens}</span>
                <span className="dice-face ones-die">{faces.ones}</span>
              </>
            )}
          </div>

          <p className="dice-roll-hint">
            {revealed ? '结果已锁定，确认后继续结算' : <span className="dice-roll-pending">骰面翻滚中</span>}
          </p>
          <div className="dice-roll-outcome">
            {revealed ? <h3>{RESULT_TITLES[roll.result.level]}</h3> : <span>D100 · 百分骰检定</span>}
          </div>
        </div>

        <footer>
          {revealed && (
            <button className="dice-roll-confirm" onClick={onConfirm} ref={confirmRef} type="button">
              <Check aria-hidden="true" size={16} />
              确认结果
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
