import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { NarrativeMessage } from '../../types/game';

interface ReadingPosition {
  width: number;
  height: number;
  bottom: boolean;
  message: HTMLElement | null;
  offset: number;
  messageHeight: number;
}

function capturePosition(panel: HTMLElement): ReadingPosition {
  // Messages are ordered; find the visible record without scanning a long history.
  const messages = panel.children;
  let low = 0, high = messages.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((messages[middle] as HTMLElement).offsetTop <= panel.scrollTop) low = middle + 1;
    else high = middle;
  }
  const message = messages[Math.max(0, low - 1)] as HTMLElement | undefined;
  return {
    width: panel.clientWidth, height: panel.clientHeight,
    bottom: panel.scrollHeight - panel.clientHeight - panel.scrollTop <= 1,
    message: message ?? null,
    offset: panel.scrollTop - (message?.offsetTop ?? 0),
    messageHeight: message?.offsetHeight ?? 0
  };
}

/** Preserve reading intent across folding, reflow and the on-screen keyboard. */
export function useNarrativeReading(panelRef: RefObject<HTMLDivElement>, latestRef: RefObject<HTMLDivElement>, messages: NarrativeMessage[]) {
  const latestId = messages[messages.length - 1]?.id;
  const previousLatestId = useRef<string>();
  const previousLatestStart = useRef(0);
  const reading = useRef<ReadingPosition | null>(null);
  const restoredTop = useRef<number | null>(null);
  const [hasNewContent, setHasNewContent] = useState(false);

  function latestStart(panel: HTMLElement, latest: HTMLElement) {
    return Math.min(latest.offsetTop, Math.max(0, panel.scrollHeight - panel.clientHeight));
  }

  function preservePosition() {
    const panel = panelRef.current, latest = latestRef.current, position = reading.current;
    if (!panel || !latest) return;
    if (!position || !position.height) { reading.current = capturePosition(panel); return; }
    if (position.width === panel.clientWidth && position.height === panel.clientHeight) return;
    const maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const message = position.message && panel.contains(position.message) ? position.message : null;
    if (!position.bottom && !message) { reading.current = capturePosition(panel); return; }
    // A width change reflows prose. Keep the same record and relative place in it.
    const offset = position.width !== panel.clientWidth && position.messageHeight > 0 && message
      ? position.offset * message.offsetHeight / position.messageHeight : position.offset;
    const desiredTop = position.bottom ? maximum : (message?.offsetTop ?? 0) + offset;
    panel.scrollTop = Math.max(0, Math.min(maximum, desiredTop));
    restoredTop.current = panel.scrollTop;
    // Keep the intended bookmark even if a larger reading area temporarily clamps it.
    reading.current = { ...position, width: panel.clientWidth, height: panel.clientHeight,
      offset, messageHeight: message?.offsetHeight ?? position.messageHeight };
    previousLatestStart.current = latestStart(panel, latest);
  }

  function handleScroll() {
    const panel = panelRef.current, latest = latestRef.current;
    if (!panel || !latest) return;
    const position = reading.current;
    if (position?.height && (position.height !== panel.clientHeight || position.width !== panel.clientWidth)) {
      // Resize-induced scroll events can arrive before ResizeObserver.
      preservePosition();
    } else if (restoredTop.current !== panel.scrollTop) {
      reading.current = capturePosition(panel);
      restoredTop.current = null;
    }
    previousLatestStart.current = latestStart(panel, latest);
    if (panel.scrollTop >= previousLatestStart.current - 12) setHasNewContent(false);
  }

  // Run after every commit: a growing action or waiting row also changes the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current, latest = latestRef.current;
    if (!panel || !latest) return;
    const previousId = previousLatestId.current;
    if (previousId === latestId) {
      preservePosition();
      previousLatestStart.current = latestStart(panel, latest);
      return;
    }
    const replaced = previousId !== undefined && !messages.some(message => message.id === previousId);
    // Read the actual position so a queued manual scroll cannot force a new reply on a reader.
    const followLatest = previousId === undefined || replaced || panel.scrollTop >= previousLatestStart.current - 12;
    previousLatestId.current = latestId;
    previousLatestStart.current = latestStart(panel, latest);
    if (followLatest) {
      panel.scrollTo({ top: latest.offsetTop, behavior: 'auto' });
      setHasNewContent(false);
    } else setHasNewContent(true);
    restoredTop.current = panel.scrollTop;
    reading.current = capturePosition(panel);
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(preservePosition);
    observer?.observe(panel);
    window.addEventListener('resize', preservePosition);
    return () => { observer?.disconnect(); window.removeEventListener('resize', preservePosition); };
  }, [panelRef, latestRef]);

  function readNewContent() {
    const panel = panelRef.current, latest = latestRef.current;
    if (!panel || !latest) return;
    panel.scrollTo({ top: latest.offsetTop, behavior: 'auto' });
    restoredTop.current = panel.scrollTop;
    reading.current = capturePosition(panel);
    setHasNewContent(false);
    panel.focus({ preventScroll: true });
  }

  return { hasNewContent, handleScroll, readNewContent };
}
