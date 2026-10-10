import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { GameState } from '../../types/game';
import { getScenarioDefinition, getScenarioProgressForState, getVisibleScenarioObjectives } from '../../scenario/engine';
import { isPlayerVisibleLogEntry } from '../../services/narrativeVisibility';
import { ArchiveEmptyArt } from '../shared/ArchiveEmptyArt';
import { JournalArt } from '../shared/JournalArt';
import { InvestigationEmblemArt } from '../shared/InvestigationEmblemArt';
import './investigation-records.css';

type Progress = ReturnType<typeof getScenarioProgressForState>;
type Objectives = ReturnType<typeof getVisibleScenarioObjectives>;

function ObjectiveRows({ objectives, progress }: { objectives: Objectives; progress: Progress }) {
  return <ul className="objective-list">{objectives.map((objective) => {
    const status = progress.objectiveStates[objective.id];
    return <li className={`objective-row ${status}`} key={objective.id}>
      <span>{status === 'completed' ? '已完成' : status === 'failed' ? '未完成' : '进行中'}</span>
      <strong>{objective.playerText}</strong>
    </li>;
  })}</ul>;
}

export function InvestigationProgress({ state }: { state: GameState }) {
  const progress = getScenarioProgressForState(state);
  const objectives = getVisibleScenarioObjectives(progress);
  const ending = getScenarioDefinition().progression.endings.find((item) => item.id === progress.endingId);
  const current = objectives.filter((objective) => !['completed', 'failed'].includes(progress.objectiveStates[objective.id]));
  const past = objectives.filter((objective) => ['completed', 'failed'].includes(progress.objectiveStates[objective.id]));
  const clueStates = Object.values(progress.clueStates);
  const found = clueStates.filter((status) => status !== 'unknown').length;
  const analyzed = clueStates.filter((status) => status === 'analyzed').length;
  const clocks = (getScenarioDefinition().presentation.clocks ?? []).flatMap((presentation) => {
    const clock = progress.clocks[presentation.id];
    return clock?.visible && presentation.max > 0 ? [{ presentation, clock }] : [];
  });

  return <section className="investigation-progress scenario-progress" aria-label="剧情进度">
    {ending && <section className="investigation-card investigation-ending"><h3><InvestigationEmblemArt kind="seal" />{ending.title}</h3><p>{ending.summary}</p></section>}
    {(!ending || current.length > 0) && <section className="investigation-card">
      <h3><InvestigationEmblemArt />调查目标</h3>
      {current.length ? <ObjectiveRows objectives={current} progress={progress} />
        : <p className="investigation-note">{progress.endingId ? '本次调查已告一段落。' : '暂无新的调查目标。'}</p>}
    </section>}
    {clocks.length > 0 && <section className="investigation-card investigation-clocks">
      <h3><InvestigationEmblemArt kind="clock" />局势</h3>
      {clocks.map(({ presentation, clock }) => <div className="clock-row" key={presentation.id}>
        <div><strong>{presentation.label}</strong><span>{clock.value} / {presentation.max}</span></div>
        <progress aria-label={presentation.label} max={presentation.max} value={Math.max(0, Math.min(presentation.max, clock.value))} />
      </div>)}
    </section>}
    {found > 0 && <section className="investigation-card investigation-clues">
      <h3><JournalArt />线索进度</h3>
      <p className="progress-stat">已发现 {found}{' · '}已分析 {analyzed}</p>
    </section>}
    {past.length > 0 && <details className="investigation-card investigation-history" open={current.length === 0}>
      <summary><Check size={16} aria-hidden="true" /><span>调查回顾</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <ObjectiveRows objectives={past} progress={progress} />
    </details>}
  </section>;
}

interface ActionLogArchiveProps {
  entries: GameState['actionLog'];
  scrollPosition: MutableRefObject<number>;
}

export function ActionLogArchive({ entries, scrollPosition }: ActionLogArchiveProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const visible = (entries ?? []).filter(isPlayerVisibleLogEntry);
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollPosition.current;
  }, [scrollPosition]);

  return <section className="action-log-archive" aria-label="行动日志">
    <div className="action-log-heading"><h3>行动日志</h3></div>
    <ol ref={listRef} className="action-log-list" aria-label="行动记录" onScroll={(event) => {
      scrollPosition.current = event.currentTarget.scrollTop;
    }}>
      {visible.map((entry, index) => <li key={`${entry.time}-${index}`}>
        <span className="action-log-time">{entry.time}</span><p>{entry.text}</p>
      </li>)}
      {!visible.length && <li className="action-log-empty" role="status">
        <ArchiveEmptyArt /><span>暂无行动记录。</span>
      </li>}
    </ol>
  </section>;
}
