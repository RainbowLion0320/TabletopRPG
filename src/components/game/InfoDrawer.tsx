import { lazy, Suspense, useId, useRef, useState, useCallback, useEffect, type KeyboardEvent, type PointerEvent } from 'react';
import { BookOpen, Clock3, GripVertical, Target, X } from 'lucide-react';
import type { GameState } from '../../types/game';
import { useDialogFocus } from '../shared/useDialogFocus';
import { usePortraitLayout } from '../../platform/layout';
import { storyData } from '../../data/storyData';
import { isPlayerVisibleLogEntry } from '../../services/narrativeVisibility';
import { getScenarioDefinition, getScenarioProgressForState, getVisibleScenarioObjectives } from '../../scenario/engine';
import './info-drawer.css';

const CaseBoard = lazy(() => import('./CaseBoard').then((module) => ({ default: module.CaseBoard })));
const drawerTabs = [['progress', '进度'], ['board', '案件板'], ['log', '日志']] as const;

interface InfoDrawerProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onOpen: () => void;
}

export function InfoDrawer({ onClose, onOpen, open, state }: InfoDrawerProps) {
  const [activeTab, setActiveTab] = useState<'progress' | 'board' | 'log'>('board');
  const portrait = usePortraitLayout();
  const id = useId();
  const scenario = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const objectives = getVisibleScenarioObjectives(progress);
  const visibleClocks = Object.entries(progress.clocks).filter(([, clock]) => clock.visible);
  const clockPresentation = new Map((scenario.presentation.clocks ?? []).map((clock) => [clock.id, clock]));

  const tabRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [tabTop, setTabTop] = useState(43);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ pointerId: number; startY: number; startTop: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    suppressClick.current = false;
    if (portrait || event.button !== 0 || !event.isPrimary) return;
    dragState.current = { pointerId: event.pointerId, startY: event.clientY, startTop: tabTop, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragState.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) <= 6) return;
    drag.moved = true;
    setDragging(true);
    setTabTop(Math.max(8, Math.min(85, drag.startTop + deltaY / window.innerHeight * 100)));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const drag = dragState.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    suppressClick.current = drag.moved || cancelled;
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    const pointerId = dragState.current?.pointerId;
    if (pointerId !== undefined) suppressClick.current = true;
    dragState.current = null;
    setDragging(false);
    if (pointerId !== undefined && tabRef.current?.hasPointerCapture(pointerId)) tabRef.current.releasePointerCapture(pointerId);
  }, [portrait]);

  useEffect(() => {
    if (open) setActiveTab('board');
  }, [open]);

  useEffect(() => {
    if (drawerRef.current) drawerRef.current.inert = !open;
  }, [open]);
  useDialogFocus(open, drawerRef, onClose, tabRef);

  const handleClose = useCallback(() => {
    tabRef.current?.focus({ preventScroll: true });
    onClose();
  }, [onClose]);

  function changeTabWithKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % drawerTabs.length
      : event.key === 'ArrowLeft' ? (index + drawerTabs.length - 1) % drawerTabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? drawerTabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setActiveTab(drawerTabs[next][0]);
    drawerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <>
      <button
        aria-controls="game-info-drawer"
        aria-label="资料"
        aria-expanded={open}
        aria-haspopup="dialog"
        type="button"
        ref={tabRef}
        className={`drawer-tab${portrait ? '' : ' draggable'}${dragging ? ' dragging' : ''}`}
        style={portrait ? undefined : { top: `${tabTop}%` }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={(event) => endDrag(event)}
        onPointerCancel={(event) => endDrag(event, true)}
        onLostPointerCapture={(event) => endDrag(event, true)}
        onClick={(event) => {
          const suppressed = event.detail !== 0 && suppressClick.current;
          suppressClick.current = false;
          if (suppressed) return;
          event.currentTarget.focus({ preventScroll: true });
          onOpen();
        }}
        title={portrait ? '资料' : '资料（可拖动位置）'}
        data-sound="paper"
      >
        {!portrait && <GripVertical size={12} className="drawer-grip" aria-hidden="true" />}
        <BookOpen size={16} />
        <span>资料</span>
      </button>
      <aside
        aria-hidden={!open}
        aria-label="资料"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`info-drawer-react fullscreen ${open ? 'open' : ''}`}
        id="game-info-drawer"
        tabIndex={-1}
        ref={drawerRef}
      >
        <header>
          <div className="info-drawer-title">
            <h2>资料</h2>
            <span>{storyData.scenes[state.currentScene]?.chapterTitle ?? '当前章节'}</span>
          </div>
          <nav className="info-drawer-tabs" role="tablist" aria-label="资料视图">
            {drawerTabs.map(([tab, label], index) => <button key={tab} type="button" role="tab" id={`${id}-${tab}`} aria-controls={`${id}-page`}
              aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)} onKeyDown={(event) => changeTabWithKey(event, index)}>{label}</button>)}
          </nav>
          <button aria-label="关闭资料" onClick={handleClose} title="关闭"><X size={18} /></button>
        </header>

        <div className={`info-drawer-page ${activeTab}-page`} role="tabpanel" id={`${id}-page`} aria-labelledby={`${id}-${activeTab}`}>
        {activeTab === 'progress' ? (
          <section className="drawer-section scenario-progress" aria-label="剧情进度">
            <h3><Target size={17} />调查目标</h3>
            <div className="objective-list">
              {objectives.map((objective) => (
                <div className={`objective-row ${progress.objectiveStates[objective.id]}`} key={objective.id}>
                  <span>{progress.objectiveStates[objective.id] === 'completed'
                    ? '已完成'
                    : progress.objectiveStates[objective.id] === 'failed' ? '未完成' : '进行中'}</span>
                  <strong>{objective.playerText}</strong>
                </div>
              ))}
            </div>
            <h3><BookOpen size={17} />线索进度</h3>
            <p className="progress-stat">
              已发现 {Object.values(progress.clueStates).filter((status) => status !== 'unknown').length}
              {' · '}已分析 {Object.values(progress.clueStates).filter((status) => status === 'analyzed').length}
            </p>
            {visibleClocks.length ? <h3><Clock3 size={17} />可见时钟</h3> : null}
            {visibleClocks.map(([clockId, clock]) => {
              const presentation = clockPresentation.get(clockId);
              if (!presentation) return null;
              return (
                <div className="clock-row" key={clockId}>
                  <strong>{presentation.label}</strong><span>{clock.value} / {presentation.max}</span>
                </div>
              );
            })}
          </section>
        ) : null}

        {open && activeTab === 'board' ? (
          <Suspense fallback={<p className="empty-note">正在整理案件资料...</p>}>
            <CaseBoard state={state} />
          </Suspense>
        ) : null}

        {activeTab === 'log' ? (
          <section className="drawer-section" aria-label="行动日志">
            <h3>行动日志</h3>
            <div className="log-list-modern">
              {(state.actionLog ?? []).filter(isPlayerVisibleLogEntry).map((log, index) => (
                <p key={`${log.time}-${index}`}><span>{log.time}</span>{log.text}</p>
              ))}
            </div>
          </section>
        ) : null}
        </div>
      </aside>
    </>
  );
}
