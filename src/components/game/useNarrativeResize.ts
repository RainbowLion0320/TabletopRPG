import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react';

const HEIGHT_STORAGE_KEY = 'ttrpg.narrative-height-ratio';
const MIN_HEIGHT = 142;
const EDGE_GAP = 8;
const KEYBOARD_STEP = 24;

interface DragState {
  pointerId: number;
  startY: number;
  startHeight: number;
  maximum: number;
  pending: number;
  frame: number | null;
}

function clamp(value: number, lower: number, upper: number) {
  return Math.min(Math.max(value, lower), Math.max(lower, upper));
}

function readStoredRatio(): number | null {
  try {
    const raw = window.localStorage.getItem(HEIGHT_STORAGE_KEY);
    if (!raw) return null;
    const ratio = Number.parseFloat(raw);
    return Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : null;
  } catch {
    return null;
  }
}

function storeRatio(ratio: number) {
  try {
    window.localStorage.setItem(HEIGHT_STORAGE_KEY, ratio.toFixed(3));
  } catch {
    // Private browsing rejects the write; the panel simply forgets its height.
  }
}

function screenOf(panel: HTMLElement | null) {
  return panel?.closest('.game-screen') as HTMLElement | null;
}

/**
 * The reading panel grows from its top edge. The height lives on the game-screen
 * grid as a custom property, so a drag never re-renders the story, and the scene
 * row gives the space back on its own.
 */
export function useNarrativeResize(panelRef: RefObject<HTMLDivElement>, onResizeStart?: () => void) {
  const dragRef = useRef<DragState | null>(null);
  const heightRef = useRef<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);

  const write = useCallback((value: number | null) => {
    const screen = screenOf(panelRef.current);
    heightRef.current = value;
    if (!screen) return;
    if (value == null) {
      screen.style.removeProperty('--narrative-height');
      delete screen.dataset.narrativeResized;
      return;
    }
    screen.style.setProperty('--narrative-height', `${Math.round(value)}px`);
    screen.dataset.narrativeResized = '';
  }, [panelRef]);

  // The scene top is the ceiling: below it the panel would cover the reading edge.
  const measure = useCallback(() => {
    const panel = panelRef.current;
    const screen = screenOf(panel);
    if (!panel || !screen) return null;
    const panelRect = panel.getBoundingClientRect();
    const stage = screen.querySelector('.scene-stage');
    const dock = screen.querySelector('.action-dock');
    const ceiling = stage?.getBoundingClientRect().top ?? screen.getBoundingClientRect().top;
    const anchor = Math.min(panelRect.bottom, dock?.getBoundingClientRect().top ?? panelRect.bottom);
    return {
      current: panelRect.height,
      screenHeight: screen.getBoundingClientRect().height,
      maximum: Math.max(MIN_HEIGHT, anchor - ceiling - EDGE_GAP)
    };
  }, [panelRef]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const measured = measure();
    if (!measured) return;
    // Pin the current pixels first: leaving the maximised state must not jump.
    write(measured.current);
    onResizeStart?.();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const screen = screenOf(panelRef.current);
    if (screen) screen.dataset.narrativeResizing = '';
    setResizing(true);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: measured.current,
      maximum: measured.maximum,
      pending: clamp(measured.current, MIN_HEIGHT, measured.maximum),
      frame: null
    };
  }, [measure, onResizeStart, panelRef, write]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pending = clamp(drag.startHeight + (drag.startY - event.clientY), MIN_HEIGHT, drag.maximum);
    if (drag.frame != null) return;
    drag.frame = window.requestAnimationFrame(() => {
      const active = dragRef.current;
      if (!active) return;
      active.frame = null;
      write(active.pending);
    });
  }, [write]);

  const finish = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.frame != null) window.cancelAnimationFrame(drag.frame);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const screen = screenOf(panelRef.current);
    if (screen) delete screen.dataset.narrativeResizing;
    setResizing(false);
    const next = clamp(drag.pending, MIN_HEIGHT, drag.maximum);
    write(next);
    setHeight(next);
    if (screen) storeRatio(next / Math.max(1, screen.getBoundingClientRect().height));
  }, [panelRef, write]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const measured = measure();
    if (!measured) return;
    const current = heightRef.current ?? measured.current;
    const next = event.key === 'ArrowUp' ? current + KEYBOARD_STEP
      : event.key === 'ArrowDown' ? current - KEYBOARD_STEP
        : event.key === 'Home' ? MIN_HEIGHT
          : event.key === 'End' ? measured.maximum
            : null;
    if (next == null) return;
    event.preventDefault();
    const value = clamp(next, MIN_HEIGHT, measured.maximum);
    write(value);
    setHeight(value);
    storeRatio(value / Math.max(1, measured.screenHeight));
  }, [measure, write]);

  // A stored ratio survives a different window size without ever overflowing it.
  useEffect(() => {
    const ratio = readStoredRatio();
    if (ratio == null) return;
    const measured = measure();
    if (!measured) return;
    const value = clamp(Math.round(ratio * measured.screenHeight), MIN_HEIGHT, measured.maximum);
    write(value);
    setHeight(value);
  }, [measure, write]);

  useEffect(() => {
    if (height == null) return;
    function fitToViewport() {
      const measured = measure();
      if (!measured || height == null) return;
      const value = clamp(height, MIN_HEIGHT, measured.maximum);
      if (value === height) return;
      write(value);
      setHeight(value);
    }
    window.addEventListener('resize', fitToViewport);
    return () => window.removeEventListener('resize', fitToViewport);
  }, [height, measure, write]);

  return {
    resized: height != null,
    resizing,
    handleProps: {
      role: 'separator' as const,
      'aria-orientation': 'horizontal' as const,
      'aria-label': '调整剧情面板高度',
      'aria-valuemin': MIN_HEIGHT,
      ...(height != null ? { 'aria-valuenow': Math.round(height) } : {}),
      tabIndex: 0,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onKeyDown: handleKeyDown
    }
  };
}
