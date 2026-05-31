/**
 * DmDebugDrawer (Phase 7) - DEV 模式专用调试抽屉。
 *
 * 仅在 import.meta.env.DEV 下渲染。挂在右下角，默认折叠；点开后按 tab 展示
 * 最近一轮的 Context / Narrator 原始返回 / 工具调用（接受/拒绝）/ 长期记忆压缩。
 *
 * 数据来源：dm/debugTrace.ts 的进程内环；不进存档、不持久化。
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
        onClick={() => setOpen(true)}
        style={floatingButtonStyle}
        title="Open DM Debug Drawer (DEV only)"
      >
        DM ⚙
      </button>
    );
  }

  return (
    <div style={drawerStyle}>
      <header style={headerStyle}>
        <strong style={{ marginRight: 'auto' }}>DM Debug · {traces.length} 轮</strong>
        <button type="button" style={btnStyle} onClick={() => clearTraces()}>清空</button>
        <button type="button" style={btnStyle} onClick={() => setOpen(false)}>关闭</button>
      </header>

      <div style={bodyStyle}>
        <aside style={listStyle}>
          {traces.length === 0 ? (
            <div style={emptyStyle}>暂无 DM 轮次。提交一次行动即可看到追踪。</div>
          ) : (
            traces.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                style={{
                  ...listItemStyle,
                  ...(active?.id === t.id ? listItemActiveStyle : null)
                }}
              >
                <div style={{ fontWeight: 600 }}>#{t.turn} · {formatTime(t.timestamp)}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  {t.actions.map((a) => `${a.player}：${truncate(a.action, 14)}`).join(' / ')}
                </div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={badgeOk}>✓{t.acceptedCalls.length}</span>
                  {t.rejectedCalls.length > 0 ? <span style={badgeBad}>✗{t.rejectedCalls.length}</span> : null}
                  {t.usedFunctionCalling ? null : <span style={badgeWarn}>JSON</span>}
                  {t.memoryUpdate ? <span style={badgeInfo}>📓</span> : null}
                </div>
              </button>
            ))
          )}
        </aside>

        <main style={detailStyle}>
          {active ? (
            <>
              <nav style={tabRowStyle}>
                {(['ctx', 'narrator', 'tools', 'memory'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    style={{ ...tabBtnStyle, ...(tab === t ? tabBtnActive : null) }}
                  >
                    {tabLabel(t)}
                  </button>
                ))}
              </nav>
              <div style={paneStyle}>
                {tab === 'ctx' && <CtxPane trace={active} />}
                {tab === 'narrator' && <NarratorPane trace={active} />}
                {tab === 'tools' && <ToolsPane trace={active} />}
                {tab === 'memory' && <MemoryPane trace={active} />}
              </div>
            </>
          ) : (
            <div style={emptyStyle}>选择一轮查看详情</div>
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
        <pre style={preStyle}>{JSON.stringify(actions, null, 2)}</pre>
      </Section>
      <Section title="Static">
        <pre style={preStyle}>{JSON.stringify(ctx.static, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / Scene + Reachable">
        <pre style={preStyle}>{JSON.stringify({
          currentScene: ctx.dynamic.currentScene,
          reachableScenes: ctx.dynamic.reachableScenes,
          playerLocations: ctx.dynamic.playerLocations,
          knownClueNames: ctx.dynamic.knownClueNames
        }, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / NPCs">
        <pre style={preStyle}>{JSON.stringify(ctx.dynamic.npcs, null, 2)}</pre>
      </Section>
      <Section title="Dynamic / Items">
        <pre style={preStyle}>{JSON.stringify(ctx.dynamic.items, null, 2)}</pre>
      </Section>
      <Section title="Working Memory">
        <pre style={preStyle}>{JSON.stringify(ctx.dynamic.workingMemory, null, 2)}</pre>
      </Section>
      <Section title="Spotlight Player">
        <pre style={preStyle}>{JSON.stringify(ctx.dynamic.spotlightPlayer, null, 2)}</pre>
      </Section>
      <Section title="Other Players">
        <pre style={preStyle}>{JSON.stringify(ctx.dynamic.otherPlayers, null, 2)}</pre>
      </Section>
      <Section title="Recent Turns">
        <pre style={preStyle}>{JSON.stringify(ctx.recentTurns, null, 2)}</pre>
      </Section>
      <Section title="Long-term Summary">
        <pre style={preStyle}>{ctx.summary || '(空)'}</pre>
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
        <pre style={preStyle}>{trace.narratorRaw || '(空)'}</pre>
      </Section>
    </div>
  );
}

function ToolsPane({ trace }: { trace: DmTrace }) {
  return (
    <div>
      <Section title={`All Parsed (${trace.toolCalls.length})`}>
        <pre style={preStyle}>{JSON.stringify(trace.toolCalls, null, 2)}</pre>
      </Section>
      <Section title={`Accepted (${trace.acceptedCalls.length})`}>
        <pre style={preStyle}>{JSON.stringify(trace.acceptedCalls, null, 2)}</pre>
      </Section>
      <Section title={`Rejected (${trace.rejectedCalls.length})`}>
        {trace.rejectedCalls.length === 0 ? (
          <div style={{ opacity: 0.6 }}>无拒绝</div>
        ) : (
          <pre style={preStyle}>
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
    return <div style={{ opacity: 0.6, padding: 8 }}>本轮未触发长期记忆压缩。</div>;
  }
  return (
    <div>
      <Section title={`summarizedUntilIndex = ${trace.memoryUpdate.summarizedUntilIndex}`}>
        <div />
      </Section>
      <Section title="Summary">
        <pre style={preStyle}>{trace.memoryUpdate.summary}</pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={sectionTitleStyle}>{title}</div>
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

// ---------- 内联样式（避免污染全局 CSS） ----------

const floatingButtonStyle: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 9999,
  padding: '6px 10px',
  background: 'rgba(20, 20, 28, 0.85)',
  color: '#cfcfe5',
  border: '1px solid #5a5a7a',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace'
};

const drawerStyle: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  width: 'min(820px, 92vw)',
  height: 'min(560px, 80vh)',
  zIndex: 9999,
  background: 'rgba(15, 15, 22, 0.97)',
  color: '#e7e7ef',
  border: '1px solid #5a5a7a',
  borderRadius: 8,
  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 12
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  padding: '6px 10px',
  borderBottom: '1px solid #3a3a55'
};

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  background: 'transparent',
  color: '#cfcfe5',
  border: '1px solid #5a5a7a',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0
};

const listStyle: React.CSSProperties = {
  width: 220,
  borderRight: '1px solid #3a3a55',
  overflowY: 'auto',
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 4
};

const listItemStyle: React.CSSProperties = {
  textAlign: 'left',
  background: 'transparent',
  color: '#cfcfe5',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '5px 6px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11
};

const listItemActiveStyle: React.CSSProperties = {
  background: 'rgba(120, 110, 200, 0.18)',
  borderColor: '#7a78a8'
};

const detailStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0
};

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #3a3a55'
};

const tabBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: '#cfcfe5',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12
};

const tabBtnActive: React.CSSProperties = {
  borderBottomColor: '#9c95e8',
  color: '#fff'
};

const paneStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 10
};

const sectionTitleStyle: React.CSSProperties = {
  color: '#9c95e8',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid #2c2c44',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: 11,
  lineHeight: 1.5,
  maxHeight: 280,
  overflow: 'auto'
};

const emptyStyle: React.CSSProperties = {
  opacity: 0.6,
  padding: 12,
  fontSize: 12
};

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 4px',
  marginRight: 4,
  borderRadius: 3,
  fontSize: 10
};
const badgeOk: React.CSSProperties = { ...badgeBase, background: 'rgba(80,170,90,0.25)', color: '#8fe39a' };
const badgeBad: React.CSSProperties = { ...badgeBase, background: 'rgba(190,80,80,0.25)', color: '#f0a0a0' };
const badgeWarn: React.CSSProperties = { ...badgeBase, background: 'rgba(190,160,60,0.25)', color: '#f5d27e' };
const badgeInfo: React.CSSProperties = { ...badgeBase, background: 'rgba(80,140,200,0.25)', color: '#9bc6ec' };
