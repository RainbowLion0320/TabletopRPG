import { useEffect, useState } from 'react';
import type { DiceRollPresentation } from '../../app/useGameController';

interface DiceRollOverlayProps {
  roll: DiceRollPresentation | null;
}

function outcomeClass(level: DiceRollPresentation['result']['level']) {
  if (level === 'fail' || level === 'fumble') return 'failure';
  if (level === 'crit' || level === 'hard') return 'exceptional';
  return 'success';
}

export function DiceRollOverlay({ roll }: DiceRollOverlayProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    if (!roll || roll.phase === 'revealed') return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 72);
    return () => window.clearInterval(interval);
  }, [roll?.phase, roll?.result.roll]);

  if (!roll) return null;

  const shownRoll = roll.phase === 'revealed'
    ? roll.result.roll
    : ((roll.result.roll + tick * 37) % 100) + 1;
  const tens = shownRoll === 100 ? '00' : String(Math.floor(shownRoll / 10) * 10).padStart(2, '0');
  const units = String(shownRoll % 10);
  const revealed = roll.phase === 'revealed';

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`dice-roll-overlay ${roll.phase}`}
      role="status"
    >
      <div className="dice-roll-presentation">
        <span className="dice-roll-kicker">D100 · 命运检定</span>
        <div className="dice-roll-context">
          <strong>{roll.check.player}</strong>
          <span>{roll.check.skill} · {roll.check.difficulty}难度 · 阈值 {roll.check.threshold ?? '-'}</span>
        </div>
        <div className="percentile-dice" aria-hidden="true">
          <div className="percentile-die percentile-die-tens"><span>{tens}</span></div>
          <div className="percentile-die percentile-die-units"><span>{units}</span></div>
        </div>
        {revealed ? (
          <div className={`dice-roll-outcome ${outcomeClass(roll.result.level)}`}>
            <span className="dice-roll-total">{roll.result.roll}</span>
            <strong>{roll.result.label}</strong>
          </div>
        ) : (
          <p className="dice-roll-wait">骰声掠过桌面，命运正在落定</p>
        )}
      </div>
    </div>
  );
}
