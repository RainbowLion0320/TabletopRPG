import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OPENING_SEEN_KEY, shouldPlayOpening, useOpeningCinematic } from '../../src/platform/opening';
import { installGameStorage } from '../../src/platform/storage';

let reduced = false;
beforeEach(() => {
  localStorage.clear(); installGameStorage(localStorage); reduced = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
});
afterEach(() => { cleanup(); installGameStorage(localStorage); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('finishes the first opening without changing investigation or connection records', () => {
  localStorage.setItem('trpg-saves-v2', 'original investigation'); localStorage.setItem('trpg-api', 'original connection');
  const view = renderHook(useOpeningCinematic); expect(view.result.current.open).toBe(true);
  act(() => view.result.current.finish('finished'));
  expect(view.result.current.open).toBe(false); expect(localStorage.getItem(OPENING_SEEN_KEY)).toBe('seen');
  expect(localStorage.getItem('trpg-saves-v2')).toBe('original investigation'); expect(localStorage.getItem('trpg-api')).toBe('original connection');
});
it('records an explicit skip and starts the next launch directly at the title', () => {
  const first = renderHook(useOpeningCinematic); act(() => first.result.current.finish('skipped')); first.unmount();
  expect(renderHook(useOpeningCinematic).result.current.open).toBe(false);
});
it('leaves unavailable media retryable next launch while allowing the current title to open', () => {
  const first = renderHook(useOpeningCinematic); act(() => first.result.current.finish('unavailable'));
  expect(first.result.current.open).toBe(false); expect(localStorage.getItem(OPENING_SEEN_KEY)).toBeNull(); first.unmount();
  expect(renderHook(useOpeningCinematic).result.current.open).toBe(true);
});
it('replays by player request and preserves the actual opener for focus return', () => {
  localStorage.setItem(OPENING_SEEN_KEY, 'seen'); const button = document.createElement('button'); document.body.append(button); button.focus();
  const view = renderHook(useOpeningCinematic); expect(view.result.current.open).toBe(false);
  act(() => view.result.current.replay()); expect(view.result.current.open).toBe(true);
  expect(view.result.current.playId).toBe(1); expect(view.result.current.returnFocusRef.current).toBe(button); button.remove();
});
it('respects reduced motion for automatic startup while permitting deliberate replay', () => {
  reduced = true; expect(shouldPlayOpening()).toBe(false); const view = renderHook(useOpeningCinematic);
  act(() => view.result.current.replay()); expect(view.result.current.open).toBe(true);
});
it('closes normally when the optional seen preference cannot be stored', () => {
  installGameStorage({ getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} });
  const view = renderHook(useOpeningCinematic); expect(view.result.current.open).toBe(true);
  expect(() => act(() => view.result.current.finish('skipped'))).not.toThrow(); expect(view.result.current.open).toBe(false);
});
