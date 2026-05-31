/**
 * DmDebugDrawer (Phase 7) - DEV 模式专用调试抽屉。
 *
 * 仅在 import.meta.env.DEV 下渲染。挂在右下角，默认折叠；点开后按 tab 展示
 * 最近一轮的 Context / Narrator 原始返回 / 工具调用（接受/拒绝）/ 长期记忆压缩。
 *
 * 数据来源：dm/debugTrace.ts 的进程内环；不进存档、不持久化。
 *
 * 样式来源：src/styles/app.css 中的 `.dm-debug-*` 命名空间，避免内联样式碎片化。
 */

import { useEffect, useState } from 'react';
import {
  clearTraces,
  getTraces,
  subscribeTraces,
  type DmTrace
} from '../../dm/debugTrace';

type Tab = 'ctx' | 'narrator' | 'tools' | 'memory';

export function DmDebugDrawer() {
  const [open, setOpen] = useState(false);
  const [traces, setTraces] = useState<readonly DmTrace[]>(() => getTraces());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('ctx');

  useEffect(() => {
    const unsub = subscribeTraces(() => {
      const next = getTraces();
      setTraces([...next]);
      // 自动选中最新一轮
      if (next.length > 0) setActiveId(next[0].id);
    });
    return unsub;
  }, []);

  if (!import.meta.env.DEV) return null;

  const active = traces.find((t) => t.id === activeId) ?? traces[0];

  if (!open) {
    return (
      <button
        type="button"
        className="dm-debug-fab"
        onClick={() => setOpen(true)}
        title="Open DM Debug Drawer (DEV only)"
      >
        DM ⚙
      </button>
    );
  }

  return (
    <div className="dm-debug-drawer">
      <header className="dm-debug-header">
        <strong className="dm-debug-title">DM Debug · {traces.length} 轮</strong>
        <button type="button" className="dm-debug-btn" onClick={() => clearTraces()}>清空</button>
        <button type="button" className="dm-debug-btn" onClick={() => setOpen(false)}>关闭</button>
      </header>

      <div className="dm-debug-body">
        <aside className="dm-debug-list">
          {traces.length === 0 ? (
            <div className="dm-debug-empty">暂无 DM 轮次。提交一次行动即可看到追踪。</div>
          ) : (
            traces.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dm-debug-item ${active?.id === t.id ? 'active' : ''}`}
                onClick={() => setActiveId(t.id)}
              >
                <div className="dm-debug-item-head">#{t.turn} · {formatTime(t.timestamp)}</div>
                <div className="dm-debug-item-actions">
                  {t.actions.map((a) => `${a.player}：${truncate(a.action, 14)}`).join(' / ')}
                </div>
                <div className="dm-debug-item-badges">
                  <span className="dm-debug-badge ok">✓{t.acceptedCalls.length}</span>
                  {t.rejectedCalls.length > 0
                    ? <span className="dm-debug-badge bad">✗{t.rejectedCalls.length}</span>
                    : null}
                  {t.usedFunctionCalling
                    ? null
                    : <span className="dm-debug-badge warn">JSON</span>}
                  {t.memoryUpdate
                    ? <span className="dm-debug-badge info">📓</span>
                    : null}
                </div>
              </button>
            ))
          )}
        </aside>

        <main className="dm-debug-detail">
          {active ? (
            <>
              <nav className="dm-debug-tabs">
                {(['ctx', 'narrator', 'tools', 'memory'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`dm-debug-tab ${tab === t ? 'active' : ''}`}
                    onClick={() => setTab(t)}
                  >
                    {tabLabel(t)}
                  </button>
                ))}
              </nav>
              <div className="dm-debug-pane">
                {tab === 'ctx' && <CtxPane trace={active} />}
                {tab === 'narrator' && <NarratorPane trace={active} />}
                {tab === 'tools' && <ToolsPane trace={active} />}
                {tab === 'memory' && <MemoryPane trace={active} />}
              </div>
            </>
          ) : (
            <div className="dm-debug-empty">选择一轮查看详情</div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------- 子面板 ----------

function CtxPane({ trace }: { trace: DmTrace }) {
  const { ctx, actions } = trace;
  return (
    <div>
      <Section title="Actions">
        <pre className="dm-debug-pre">{JSON.stringify(actions, null, 2)}</pre>
      </Section>
      <Section title="Static">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.static, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / Scene + Reachable">
        <pre className="dm-debug-pre">{JSON.stringify({
          currentScene: ctx.dynamic.currentScene,
          reachableScenes: ctx.dynamic.reachableScenes,
          playerLocations: ctx.dynamic.playerLocations,
          knownClueNames: ctx.dynamic.knownClueNames
        }, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / NPCs">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.dynamic.npcs, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / Items">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.dynamic.items, null, 2)}</pre>
      </Section>
      <Section title="Working Memory">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.dynamic.workingMemory, null, 2)}</pre>
      </Section>
      <Section title="Spotlight Player">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.dynamic.spotlightPlayer, null, 2)}</pre>
      </Section>
      <Section title="Other Players">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.dynamic.otherPlayers, null, 2)}</pre>
      </Section>
      <Section title="Recent Turns">
        <pre className="dm-debug-pre">{JSON.stringify(ctx.recentTurns, null, 2)}</pre>
      </Section>
      <Section title="Long-term Summary">
        <pre className="dm-debug-pre">{ctx.summary || '(空)'}</pre>
      </Section>
    </div>
  );
}

function NarratorPane({ trace }: { trace: DmTrace }) {
  return (
    <div>
      <Section title={`Mode: ${trace.usedFunctionCalling ? 'function calling' : 'JSON 兜底'}`}>
        <div />
      </Section>
      <Section title="Raw Response">
        <pre className="dm-debug-pre">{trace.narratorRaw || '(空)'}</pre>
      </Section>
    </div>
  );
}

function ToolsPane({ trace }: { trace: DmTrace }) {
  return (
    <div>
      <Section title={`All Parsed (${trace.toolCalls.length})`}>
        <pre className="dm-debug-pre">{JSON.stringify(trace.toolCalls, null, 2)}</pre>
      </Section>
      <Section title={`Accepted (${trace.acceptedCalls.length})`}>
        <pre className="dm-debug-pre">{JSON.stringify(trace.acceptedCalls, null, 2)}</pre>
      </Section>
      <Section title={`Rejected (${trace.rejectedCalls.length})`}>
        {trace.rejectedCalls.length === 0 ? (
          <div className="dm-debug-muted">无拒绝</div>
        ) : (
          <pre className="dm-debug-pre">
            {trace.rejectedCalls
              .map((r) => `· ${r.call.name}: ${r.reason}\n  args=${JSON.stringify(r.call.arguments)}`)
              .join('\n')}
          </pre>
        )}
      </Section>
    </div>
  );
}

function MemoryPane({ trace }: { trace: DmTrace }) {
  if (!trace.memoryUpdate) {
    return <div className="dm-debug-muted dm-debug-pad">本轮未触发长期记忆压缩。</div>;
  }
  return (
    <div>
      <Section title={`summarizedUntilIndex = ${trace.memoryUpdate.summarizedUntilIndex}`}>
        <div />
      </Section>
      <Section title="Summary">
        <pre className="dm-debug-pre">{trace.memoryUpdate.summary}</pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dm-debug-section">
      <div className="dm-debug-section-title">{title}</div>
      {children}
    </div>
  );
}

// ---------- 工具 ----------

function tabLabel(t: Tab): string {
  switch (t) {
    case 'ctx':
      return 'Context';
    case 'narrator':
      return 'Narrator';
    case 'tools':
      return 'Tools';
    case 'memory':
      return 'Memory';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n: number) { return String(n).padStart(2, '0'); }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }
