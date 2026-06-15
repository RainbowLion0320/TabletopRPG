import { useRef, useState, useCallback, useEffect } from 'react';
import { BookOpen, GripVertical, X } from 'lucide-react';
import type { CaseBoardNode, GameState, StoryItem } from '../../types/game';
import { storyData } from '../../data/storyData';
import { getNpcDetail, getClueDetail, type EntityDetail } from '../../dm/entityDetail';
import { CaseBoard } from './CaseBoard';
import { EntityDetailModal } from './EntityDetailModal';

interface InfoDrawerProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onOpen: () => void;
}

export function InfoDrawer({ onClose, onOpen, open, state }: InfoDrawerProps) {
  const [selectedDetail, setSelectedDetail] = useState<EntityDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'board' | 'log'>('board');

  // 拖拽状态
  const tabRef = useRef<HTMLButtonElement>(null);
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    dragState.current = { startY: e.touches[0].clientY, startTop: tabTop };
    isDragging.current = false;
  }, [tabTop]);

  function handleClueClick(clue: StoryItem) {
    const detail = getClueDetail(clue, state);
    if (detail) setSelectedDetail(detail);
  }

  function handleBoardNodeOpen(node: CaseBoardNode) {
    if (!node.refId) return;
    if (node.type === 'npc') {
      const detail = getNpcDetail(node.refId, state);
      if (detail) setSelectedDetail(detail);
      return;
    }
    if (node.type === 'item') {
      const clue = state.clues.find((item) => item.id === node.refId) ?? storyData.items[node.refId];
      if (clue) handleClueClick(clue);
    }
  }

  return (
    <>
      <button
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
      <aside className={`info-drawer-react fullscreen ${open ? 'open' : ''}`}>
        <header>
          <div>
            <p>SESSION</p>
            <h2>资料</h2>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        <nav className="info-drawer-tabs" aria-label="资料视图">
          <button className={activeTab === 'board' ? 'active' : ''} onClick={() => setActiveTab('board')}>案件板</button>
          <button className={activeTab === 'log' ? 'active' : ''} onClick={() => setActiveTab('log')}>日志</button>
        </nav>

        {activeTab === 'board' ? (
          <CaseBoard state={state} onNodeOpen={handleBoardNodeOpen} />
        ) : null}

        {activeTab === 'log' ? (
          <section className="drawer-section" aria-label="行动日志">
            <h3>行动日志</h3>
            <div className="log-list-modern">
              {state.actionLog.map((log, index) => (
                <p key={`${log.time}-${index}`}><span>{log.time}</span>{log.text}</p>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <EntityDetailModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </>
  );
}
