import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmTurnCoordinator } from '../../src/app/dmTurnCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DmTurnCoordinator', () => {
  it('applies background updates in DM turn order', async () => {
    const coordinator = new DmTurnCoordinator();
    const firstTask = coordinator.begin(180_000);
    const secondTask = coordinator.begin(180_000);
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];

    const firstQueued = coordinator.enqueue(firstTask, first.promise, (value) => applied.push(value));
    const secondQueued = coordinator.enqueue(secondTask, second.promise, (value) => applied.push(value));
    second.resolve('turn-2');
    await Promise.resolve();
    expect(applied).toEqual([]);

    first.resolve('turn-1');
    await Promise.all([firstQueued, secondQueued]);
    expect(applied).toEqual(['turn-1', 'turn-2']);
  });

  it('aborts active work and ignores stale results after session invalidation', async () => {
    const coordinator = new DmTurnCoordinator();
    const task = coordinator.begin(180_000);
    const update = deferred<string>();
    const applied: string[] = [];
    const queued = coordinator.enqueue(task, update.promise, (value) => applied.push(value));

    coordinator.invalidate();
    expect(task.controller.signal.aborted).toBe(true);
    update.resolve('stale');
    await queued;
    expect(applied).toEqual([]);
  });

  it('aborts a task after its timeout and clears successful task timers', async () => {
    vi.useFakeTimers();
    const coordinator = new DmTurnCoordinator();
    const timedOut = coordinator.begin(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.controller.signal.aborted).toBe(true);

    const completed = coordinator.begin(100);
    coordinator.finish(completed);
    await vi.advanceTimersByTimeAsync(100);
    expect(completed.timedOut).toBe(false);
    expect(completed.controller.signal.aborted).toBe(false);
  });
});
