export interface DmSessionTask {
  readonly generation: number;
  readonly controller: AbortController;
  timedOut: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
}

type Settled<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

/**
 * Coordinates foreground and background DM work for one game session.
 * Background results are applied in turn order and stale sessions never write state.
 */
export class DmTurnCoordinator {
  private generation = 0;
  private readonly activeTasks = new Set<DmSessionTask>();
  private applyTail: Promise<void> = Promise.resolve();

  begin(timeoutMs: number): DmSessionTask {
    const task: DmSessionTask = {
      generation: this.generation,
      controller: new AbortController(),
      timedOut: false
    };
    task.timeoutId = setTimeout(() => {
      task.timedOut = true;
      task.controller.abort(new DOMException('AI DM request timed out', 'TimeoutError'));
    }, timeoutMs);
    this.activeTasks.add(task);
    return task;
  }

  isCurrent(task: DmSessionTask): boolean {
    return task.generation === this.generation && !task.controller.signal.aborted;
  }

  finish(task: DmSessionTask): void {
    if (task.timeoutId !== undefined) clearTimeout(task.timeoutId);
    task.timeoutId = undefined;
    this.activeTasks.delete(task);
  }

  invalidate(): void {
    this.generation += 1;
    for (const task of this.activeTasks) {
      if (task.timeoutId !== undefined) clearTimeout(task.timeoutId);
      task.timeoutId = undefined;
      task.controller.abort(new DOMException('Game session changed', 'AbortError'));
    }
    this.activeTasks.clear();
    this.applyTail = Promise.resolve();
  }

  enqueue<T>(
    task: DmSessionTask,
    promise: Promise<T>,
    apply: (value: T) => void,
    onError?: (error: unknown) => void
  ): Promise<void> {
    // Observe the promise immediately so a later turn cannot leave an early rejection unhandled.
    const settled: Promise<Settled<T>> = promise.then(
      (value): Settled<T> => ({ status: 'fulfilled', value }),
      (reason): Settled<T> => ({ status: 'rejected', reason })
    );
    const queued = this.applyTail.then(async () => {
      const result = await settled;
      if (!this.isCurrent(task)) return;
      if (result.status === 'fulfilled') apply(result.value);
      else onError?.(result.reason);
    }).finally(() => this.finish(task));
    this.applyTail = queued.catch(() => undefined);
    return queued;
  }
}
