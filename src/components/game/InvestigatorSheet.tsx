import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { Investigator } from '../../types/game';
import { getDifficultyThreshold } from '../../data/gameRules';
import { getSkillTotal } from '../../services/dice';
import { useDialogFocus } from '../shared/useDialogFocus';
import { ArchiveEmptyState } from '../shared/ArchiveEmptyState';
import './investigatorSheet.css';

interface InvestigatorSheetProps {
  players: Investigator[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const attributes = [['STR', '力量'], ['CON', '体质'], ['SIZ', '体型'], ['DEX', '敏捷'], ['APP', '外貌'], ['INT', '智力'], ['POW', '意志'], ['EDU', '教育']] as const;
const tabs = [['overview', '属性'], ['skills', '技能'], ['background', '随身与背景']] as const;
type SheetTab = typeof tabs[number][0];

export function InvestigatorSheet({ players, selectedId, onSelect, onClose }: InvestigatorSheetProps) {
  const player = players.find((item) => item.id === selectedId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const readingPositions = useRef<Partial<Record<SheetTab, number>>>({});
  const previousPlayer = useRef(selectedId);
  const id = useId();
  const [tab, setTab] = useState<SheetTab>('overview');
  const [query, setQuery] = useState('');
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  useDialogFocus(Boolean(player), dialogRef, onClose, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar')
  });
  useLayoutEffect(() => {
    if (previousPlayer.current !== selectedId) {
      previousPlayer.current = selectedId;
      readingPositions.current = {};
    }
    if (bodyRef.current) bodyRef.current.scrollTop = readingPositions.current[tab] ?? 0;
  }, [selectedId, tab]);

  if (!player) return null;

  function selectPlayer(playerId: string) {
    onSelect(playerId);
  }

  function searchSkills(value: string) {
    setQuery(value);
    readingPositions.current.skills = 0;
    if (tab === 'skills' && bodyRef.current) bodyRef.current.scrollTop = 0;
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    dialogRef.current?.querySelector<HTMLButtonElement>(`[id="${id}-${tabs[next][0]}"]`)?.focus();
  }

  const skillNames = Object.keys(player.skills)
    .filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => getSkillTotal(player, b) - getSkillTotal(player, a) || a.localeCompare(b, 'zh-CN'));
  const background = [
    ['经历', player.background?.story], ['信念', player.background?.belief],
    ['重要之人', player.background?.importantPerson], ['珍视之物', player.background?.meaningfulItem],
    ['特质', player.background?.trait]
  ].filter((entry) => entry[1]);

  return createPortal(
    <div className="investigator-overlay" onClick={onClose}>
      <div className="investigator-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="investigator-heading">
          <div className="investigator-portrait" aria-hidden="true">
            <span>{player.name.slice(0, 1)}</span>
            {player.portrait && failedPortrait !== player.portrait && <img src={player.portrait} alt="" onError={() => setFailedPortrait(player.portrait!)} />}
          </div>
          <div className="investigator-identity">
            <span className="investigator-caption">调查员档案</span>
            <h2 id={`${id}-title`}>{player.name}</h2>
            <p>{player.job || player.role || '调查员'}</p>
            <small>{[player.gender, `${player.age}岁`, player.hometown].filter(Boolean).join(' · ')}</small>
          </div>
          <button className="investigator-close ghost-btn" type="button" aria-label="关闭调查员档案" onClick={onClose}><X size={18} /></button>
        </header>

        {players.length > 1 && <nav className="investigator-party" aria-label="查看队员">
          {players.map((member) => <button type="button" key={member.id} aria-pressed={member.id === selectedId} onClick={() => selectPlayer(member.id)}>{member.name}</button>)}
        </nav>}

        <div className="investigator-tabs" role="tablist" aria-label="档案分类">
          {tabs.map(([key, label], index) => <button type="button" key={key} id={`${id}-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${id}-body`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(event) => handleTabKey(event, index)}>{label}</button>)}
        </div>

        {tab === 'skills' && <div className="investigator-search">
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} type="search" value={query} aria-label="搜索技能" placeholder="搜索技能" autoComplete="off" spellCheck={false} onChange={(event) => searchSkills(event.target.value)} />
          {query && <button type="button" aria-label="清除技能搜索" onClick={() => { searchSkills(''); searchRef.current?.focus({ preventScroll: true }); }}><X size={16} /></button>}
        </div>}

        <div className={`investigator-body${tab === 'skills' ? ' skills-page' : ''}`} ref={bodyRef} id={`${id}-body`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0}
          onScroll={(event) => { readingPositions.current[tab] = event.currentTarget.scrollTop; }}>
          {tab === 'overview' && <>
            <dl className="investigator-vitals" aria-label="当前状态">
              <div data-stat="hp"><dt>生命 HP</dt><dd>{player.currentHp}<small> / {player.hp}</small></dd></div>
              <div data-stat="mp"><dt>魔法 MP</dt><dd>{player.currentMp}<small> / {player.mp}</small></dd></div>
              <div data-stat="san"><dt>理智 SAN</dt><dd>{player.currentSan}<small> / {player.san}</small></dd></div>
              <div data-stat="luck"><dt>幸运</dt><dd>{player.luck}</dd></div>
            </dl>
            <h3>基础属性</h3>
            <dl className="investigator-attributes">
              {attributes.map(([key, label]) => <div key={key}><dt>{label}<small>{key}</small></dt><dd>{player.attrs[key]}</dd></div>)}
            </dl>
          </>}

          {tab === 'skills' && <>
            {skillNames.length > 0 ? <table className="investigator-skills">
              <caption>按技能值排列 · 普通 / 困难 / 极难检定</caption>
              <thead><tr><th scope="col">技能</th><th scope="col">普通</th><th scope="col">困难</th><th scope="col">极难</th></tr></thead>
              <tbody>{skillNames.map((name) => {
                const total = getSkillTotal(player, name);
                return <tr key={name}><th scope="row">{name}{player.skills[name].isJob && <small>职业</small>}</th><td>{total}</td><td>{getDifficultyThreshold(total, '困难')}</td><td>{getDifficultyThreshold(total, '极难')}</td></tr>;
              })}</tbody>
            </table> : <ArchiveEmptyState>{query.trim() ? '没有匹配的技能，试试其他名称。' : '暂无技能记录。'}</ArchiveEmptyState>}
          </>}

          {tab === 'background' && <>
            <h3>随身装备</h3>
            {player.equipment?.length ? <ul className="investigator-equipment">{player.equipment.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="investigator-empty">暂无随身装备记录。</p>}
            <h3>人物背景</h3>
            {background.length ? <dl className="investigator-background">{background.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="investigator-empty">暂无背景记录。</p>}
          </>}
        </div>
      </div>
    </div>, document.body
  );
}
