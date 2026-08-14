import { lazy, Suspense, useRef, useState, useCallback, useEffect } from 'react';
import { BookOpen, Clock3, GripVertical, Target, X } from 'lucide-react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';
import { getScenarioDefinition, getScenarioProgressForState, getVisibleScenarioObjectives } from '../../scenario/engine';

const CaseBoard = lazy(() => import('./CaseBoard').then((module) => ({ default: module.CaseBoard })));

interface InfoDrawerProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onOpen: () => void;
}

export function InfoDrawer({ onClose, onOpen, open, state }: InfoDrawerProps) {
  const [activeTab, setActiveTab] = useState<'progress' | 'board' | 'log'>('board');
  const scenario = getScenarioDefinition();
  const progress = getScenarioProgressForState(state);
  const objectives = getVisibleScenarioObjectives(progress);
  const visibleClocks = Object.entries(progress.clocks).filter(([, clock]) => clock.visible);
  const clockPresentation = new Map((scenario.presentation.clocks ?? []).map((clock) => [clock.id, clock]));

  // 拖拽状态
  const tabRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [tabTop, setTabTop] = useState(43); // 百分比
  const dragState = useRef<{ startY: number; startTop: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startTop: tabTop };
    isDragging.current = false;
  }, [tabTop]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragState.current) return;
      const deltaY = e.clientY - dragState.current.startY;
      if (Math.abs(deltaY) > 3) isDragging.current = true;
      if (!isDragging.current) return;

      const vh = window.innerHeight;
      const newTop = dragState.current.startTop + (deltaY / vh) * 100;
      setTabTop(Math.max(8, Math.min(85, newTop)));
    }

    function handleMouseUp() {
      if (dragState.current && !isDragging.current) {
        onOpen();
      }
      dragState.current = null;
      isDragging.current = false;
    }

    function handleTouchMove(e: TouchEvent) {
      if (!dragState.current || !e.touches[0]) return;
      const deltaY = e.touches[0].clientY - dragState.current.startY;
      if (Math.abs(deltaY) > 3) isDragging.current = true;
      if (!isDragging.current) return;
      e.preventDefault();

      const vh = window.innerHeight;
      const newTop = dragState.current.startTop + (deltaY / vh) * 100;
      setTabTop(Math.max(8, Math.min(85, newTop)));
    }

    function handleTouchEnd() {
      if (dragState.current && !isDragging.current) {
        onOpen();
      }
      dragState.current = null;
      isDragging.current = false;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onOpen]);

  useEffect(() => {
    if (open) setActiveTab('board');
  }, [open]);

  useEffect(() => {
    if (drawerRef.current) drawerRef.current.inert = !open;
  }, [open]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    dragState.current = { startY: e.touches[0].clientY, startTop: tabTop };
    isDragging.current = false;
  }, [tabTop]);

  const handleClose = useCallback(() => {
    tabRef.current?.focus({ preventScroll: true });
    onClose();
  }, [onClose]);

  return (
    <>
      <button
        aria-controls="game-info-drawer"
        aria-expanded={open}
        ref={tabRef}
        className={`drawer-tab${isDragging.current ? ' dragging' : ''}`}
        style={{ top: `${tabTop}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        title="资料（可拖拽）"
      >
        <GripVertical size={12} className="drawer-grip" />
        <BookOpen size={16} />
        <span>资料</span>
      </button>
      <aside
        aria-hidden={!open}
        aria-label="资料"
        className={`info-drawer-react fullscreen ${open ? 'open' : ''}`}
        id="game-info-drawer"
        ref={drawerRef}
      >
        <header>
          <div className="info-drawer-title">
            <h2>资料</h2>
            <span>{storyData.scenes[state.currentScene]?.chapterTitle ?? '当前章节'}</span>
          </div>
          <nav className="info-drawer-tabs" aria-label="资料视图">
            <button className={activeTab === 'progress' ? 'active' : ''} onClick={() => setActiveTab('progress')}>进度</button>
            <button className={activeTab === 'board' ? 'active' : ''} onClick={() => setActiveTab('board')}>案件板</button>
            <button className={activeTab === 'log' ? 'active' : ''} onClick={() => setActiveTab('log')}>日志</button>
          </nav>
          <button aria-label="关闭资料" onClick={handleClose} title="关闭"><X size={18} /></button>
        </header>

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
              {' / '}{scenario.world.items.length}
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

        {activeTab === 'board' ? (
          <Suspense fallback={<p className="empty-note">正在整理案件资料...</p>}>
            <CaseBoard state={state} />
          </Suspense>
        ) : null}

        {activeTab === 'log' ? (
          <section className="drawer-section" aria-label="行动日志">
            <h3>行动日志</h3>
            <div className="log-list-modern">
              {(state.actionLog ?? []).map((log, index) => (
                <p key={`${log.time}-${index}`}><span>{log.time}</span>{log.text}</p>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </>
  );
}
