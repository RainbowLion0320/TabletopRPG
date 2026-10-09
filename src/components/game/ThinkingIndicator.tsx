import { useEffect, useState } from 'react';
import waitingNib from '../../../assets/ui/artist/waiting-nib.webp';
import './thinking-indicator.css';

export const THINKING_TEXT = 'AI DM 正在推演下一幕';
export const THINKING_CHANGE_MS = 8_000;
export const THINKING_LINES = [
  THINKING_TEXT,
  '迷雾中的回应，正在酝酿',
  '故事还在雾中缓缓成形',
  '下一段叙事，正在落笔',
  '调查的余波，正在展开',
  '灯火未熄，故事仍在继续',
  '给故事一点时间，让回应成形',
  '正在梳理这次行动的回应',
  '每一个选择，都在留下回声',
  '等待片刻，故事还在酝酿',
  '正在为这次行动续写回应',
  '将片刻留给迷雾中的故事',
  '新的叙述，正在案卷间成形',
  '煤气灯下，故事缓缓铺开',
  '等一等，让这页故事写完整',
  '你们的行动，正在融入故事',
  '下一页调查记录，正在书写',
  '静候片刻，新的回应仍在酝酿',
  '故事的细节，正在逐一落笔',
  '迷雾深处，叙事仍在继续',
  '正在描绘行动之后的片刻',
  '纸页翻动，新的叙事渐渐成形',
  '暂歇一刻，让故事继续生长',
  '静候片刻，回应正在雾中成形'
] as const;

function shuffledLines(): string[] {
  const lines: string[] = [...THINKING_LINES];
  // Keep cosmetic choices separate from the game's dice random source.
  const values = crypto.getRandomValues(new Uint32Array(lines.length - 1));
  for (let index = lines.length - 1; index > 0; index--) {
    const pick = Math.floor(values[index - 1] / 0x100000000 * (index + 1));
    [lines[index], lines[pick]] = [lines[pick], lines[index]];
  }
  return lines;
}

export function ThinkingIndicator() {
  const [lines] = useState(shuffledLines);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex(value => (value + 1) % lines.length), THINKING_CHANGE_MS);
    return () => window.clearInterval(timer);
  }, [lines.length]);
  const text = lines[index];
  return (
    <div
      aria-busy="true"
      aria-label={THINKING_TEXT}
      aria-live="polite"
      className="thinking-line"
      role="status"
    >
      <img className="thinking-line-nib" src={waitingNib} alt="" aria-hidden="true" draggable={false} width={24} height={24} />
      <div className="thinking-line-text" aria-hidden="true">
        {text}
      </div>
    </div>
  );
}
