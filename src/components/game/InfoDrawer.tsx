import { useId, useRef, useState, useEffect, useLayoutEffect, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical, X } from 'lucide-react';
import { JournalArt } from '../shared/JournalArt';
import type { GameState } from '../../types/game';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useReadingMotion } from '../shared/useReadingMotion';
import { useOverlayPresence } from '../shared/useOverlayPresence';
import { useOverlayEntry } from '../shared/useOverlayEntry';
import { usePortraitLayout } from '../../platform/layout';
import { storyData } from '../../data/storyData';
import { ActionLogArchive, InvestigationProgress } from './InvestigationRecords';
import { CaseBoard, type CaseBoardReadingState } from './CaseBoard';
import './info-drawer.css';

const drawerTabs = [['progress', '进度'], ['board', '案件板'], ['log', '日志']] as const;
export type InfoDrawerTab = typeof drawerTabs[number][0];

interface InfoDrawerProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onOpen: () => void;
  initialTab?: InfoDrawerTab;
}

export function InfoDrawer({ onClose, onOpen, open, state, initialTab = 'board' }: InfoDrawerProps) {
  const motion = useOverlayPresence(open);
  const [activeTab, setActiveTab] = useState<InfoDrawerTab>(initialTab);
  const [opening, setOpening] = useState(0);
  const logScrollPosition = useRef(0);
  const progressReading = useRef<{ scrollTop: number; historyOpen?: boolean } | null>(null);
  const historyOpen = useRef<boolean | undefined>(undefined);
  const readingSession = useRef(false);
  const sessionTab = useRef(initialTab);
  const caseReadingState = useRef<CaseBoardReadingState | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const restoredPage = useRef<{ page: HTMLDivElement; tab: InfoDrawerTab } | null>(null);
  useReadingMotion(pageRef, activeTab, open);
  const portrait = usePortraitLayout();
  const id = useId();

  const tabRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useOverlayEntry(motion.present, drawerRef);
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
    // The percentage anchor spans the viewport minus the button's own height.
    const travel = Math.max(1, window.innerHeight - event.currentTarget.getBoundingClientRect().height);
    setTabTop(Math.max(8, Math.min(85, drag.startTop + deltaY / travel * 100)));
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

  useLayoutEffect(() => {
    if (!motion.present) {
      readingSession.current = false;
      restoredPage.current = null;
    } else if (!open || (readingSession.current && sessionTab.current === initialTab)) return;
    logScrollPosition.current = 0;
    progressReading.current = null;
    historyOpen.current = undefined;
    caseReadingState.current = null;
    if (open) {
      readingSession.current = true;
      sessionTab.current = initialTab;
      setActiveTab(initialTab);
      setOpening((current) => current + 1);
    }
  }, [open, initialTab, motion.present]);

  function selectTab(tab: InfoDrawerTab) {
    if (activeTab === 'progress' && pageRef.current) {
      progressReading.current = {
        scrollTop: pageRef.current.scrollTop,
        historyOpen: historyOpen.current
      };
    }
    setActiveTab(tab);
  }
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || !open) return;
    if (restoredPage.current?.page === page && restoredPage.current.tab === activeTab) return;
    const reading = open && activeTab === 'progress' ? progressReading.current : null;
    page.scrollTop = reading?.scrollTop ?? 0;
    restoredPage.current = { page, tab: activeTab };
  }, [activeTab, open, opening]);

  useEffect(() => {
    if (drawerRef.current) drawerRef.current.inert = !open;
  }, [open]);
  useDialogFocus(open, drawerRef, onClose, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar, .ending-actions button')
  });

  function changeTabWithKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % drawerTabs.length
      : event.key === 'ArrowLeft' ? (index + drawerTabs.length - 1) % drawerTabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? drawerTabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(drawerTabs[next][0]);
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
        style={portrait ? undefined : { top: `${tabTop}%`, transform: `translateY(-${tabTop}%)` }}
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
        <JournalArt size={24} />
        <span>资料</span>
      </button>
      <aside
        {...motion.layerProps}
        data-ui-phase={motion.present ? motion.layerProps['data-ui-phase'] : undefined}
        aria-hidden={!open}
        aria-label="资料"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`info-drawer-react fullscreen ${motion.present ? 'open' : ''}`}
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
              onClick={() => selectTab(tab)} onKeyDown={(event) => changeTabWithKey(event, index)}>{label}</button>)}
          </nav>
          <button aria-label="关闭资料" onClick={onClose} title="关闭"><X size={18} /></button>
        </header>

        <div key={opening} ref={pageRef} className={`info-drawer-page ${activeTab}-page`} role="tabpanel" id={`${id}-page`} aria-labelledby={`${id}-${activeTab}`} tabIndex={activeTab === 'progress' ? 0 : undefined}>
        {motion.present && activeTab === 'progress' ? <InvestigationProgress state={state}
          initialHistoryOpen={progressReading.current?.historyOpen} onHistoryOpenChange={(value) => { historyOpen.current = value; }} /> : null}

        {motion.present && activeTab === 'board' ? (
          <CaseBoard state={state} readingState={caseReadingState} />
        ) : null}

        {motion.present && activeTab === 'log' ? <ActionLogArchive entries={state.actionLog} scrollPosition={logScrollPosition} /> : null}
        </div>
      </aside>
    </>
  );
}
