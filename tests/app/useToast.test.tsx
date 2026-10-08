import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useToast } from '../../src/app/useToast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('dismisses a brief confirmation without leaving a timer behind', () => {
  const { result } = renderHook(useToast);
  act(() => result.current.notify('已保存'));
  expect(result.current.toast).toBe('已保存');
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.toast).toBe('');
  expect(vi.getTimerCount()).toBe(0);
});

it('gives a longer replacement time to be read instead of expiring with the old notice', () => {
  const { result, unmount } = renderHook(useToast);
  act(() => result.current.notify('已保存'));
  act(() => vi.advanceTimersByTime(1200));
  const message = '未能保存，请检查设备存储空间后重试。';
  act(() => result.current.notify(message));
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.toast).toBe(message);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.toast).toBe('');
  act(() => result.current.notify(message));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
