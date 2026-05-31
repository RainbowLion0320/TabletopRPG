import type { GameState, PersistedDMEvent, PersistedPendingConsequence } from '../../types/game';

interface DmJournalModalProps {
  open: boolean;
  state: GameState;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  check: '检定',
  state_update: '状态变更',
  secret_reveal: '揭示',
  scene_change: '场景切换',
  consequence: '后果触发',
  schedule: '后果调度',
  narrative: '叙述',
  lookup: '查询'
};

function eventLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function DmJournalModal({ onClose, open, state }: DmJournalModalProps) {
  if (!open) return null;

  const events: PersistedDMEvent[] = state.eventLog ?? [];
  const pending: PersistedPendingConsequence[] = state.pendingConsequences ?? [];
  const summary = state.longTermMemorySummary ?? '';
  // 倒序：最新在前
  const eventsDesc = events.slice().reverse();

  return (
    <div className="modal-backdrop">
      <div aria-labelledby="dm-journal-title" className="modal-card dm-journal-card" role="dialog">
        <h2 id="dm-journal-title">KP 笔记</h2>
        <p>由 DM 引擎自动维护的剧情总结、后果队列与事件时间线。仅作 KP 视角参考。</p>

        <section className="dm-journal-section">
          <h3>剧情总结</h3>
          {summary ? (
            <p className="dm-journal-summary">{summary}</p>
          ) : (
            <p className="empty-note">尚未生成长期记忆总结。</p>
          )}
        </section>

        <section className="dm-journal-section">
          <h3>未结算后果（{pending.length}）</h3>
          {pending.length ? (
            <ul className="dm-journal-pending">
              {pending.map((p) => (
                <li key={p.id}>
                  <strong>T-{p.remainingTurns}</strong>
                  <span>{p.description}</span>
                  <small>触发：{p.triggerEvent}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">无 pending 后果。</p>
          )}
        </section>

        <section className="dm-journal-section">
          <h3>事件时间线（最近 {eventsDesc.length} 条）</h3>
          {eventsDesc.length ? (
            <ul className="dm-journal-events">
              {eventsDesc.map((evt) => (
                <li key={evt.id}>
                  <span className="dm-journal-event-meta">T{evt.turn} · {eventLabel(evt.kind)}</span>
                  <span className="dm-journal-event-desc">{evt.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">尚无事件。</p>
          )}
        </section>

        <footer>
          <button className="ghost-btn" onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  );
}
