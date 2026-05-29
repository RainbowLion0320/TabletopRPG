import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { deriveInvestigatorStats } from '../../data/gameRules';
import { createInvestigatorFromPreset, presets } from '../../data/presets';
import type { Investigator } from '../../types/game';

interface CharacterSetupProps {
  onBack: () => void;
  onStart: (players: Investigator[]) => void;
}

const attrRows = [
  ['STR', '力量'],
  ['CON', '体质'],
  ['SIZ', '体型'],
  ['DEX', '敏捷'],
  ['APP', '外貌'],
  ['INT', '智力'],
  ['POW', '意志'],
  ['EDU', '教育'],
  ['Luck', '幸运']
] as const;

const otherAttrRows = attrRows.filter(([key]) => key !== 'Luck');

export function CharacterSetup({ onBack, onStart }: CharacterSetupProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => presets.slice(0, 2).map((item) => item.id));
  const [expandedAttrIds, setExpandedAttrIds] = useState<string[]>([]);
  const selectedPlayers = useMemo(
    () => presets.filter((preset) => selectedIds.includes(preset.id)).map(createInvestigatorFromPreset),
    [selectedIds]
  );

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  function toggleAttrs(event: MouseEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    setExpandedAttrIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(id);
    }
  }

  return (
    <section className="setup-screen">
      <header className="setup-header">
        <button className="icon-text-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          返回
        </button>
        <div>
          <p className="eyebrow">INVESTIGATORS</p>
          <h1>选择调查员</h1>
        </div>
        <button className="primary-btn" disabled={!selectedPlayers.length} onClick={() => onStart(selectedPlayers)}>
          <Check size={18} />
          进入游戏
        </button>
      </header>

      <div className="preset-grid-modern">
        {presets.map((preset) => {
          const selected = selectedIds.includes(preset.id);
          const attrsExpanded = expandedAttrIds.includes(preset.id);
          const stats = deriveInvestigatorStats(preset.attrs);
          const skillEntries = Object.entries(preset.skills);
          return (
            <article
              key={preset.id}
              className={`preset-card-modern ${selected ? 'selected' : ''} ${attrsExpanded ? 'attrs-expanded' : ''}`}
              onClick={() => toggle(preset.id)}
              onKeyDown={(event) => handleCardKeyDown(event, preset.id)}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
            >
              <span className="preset-select-mark">{selected ? '已选' : '选择'}</span>
              <div className="preset-portrait-frame">
                <img src={preset.portrait} alt={`${preset.name} 立绘`} />
              </div>
              <div className="preset-card-content">
                <strong>{preset.name}</strong>
                <small>{preset.role} · {preset.gender} · {preset.age}岁 · {preset.hometown}</small>
                <p>{preset.desc}</p>

                <div className="preset-vitals" aria-label={`${preset.name}派生数值`}>
                  <span><b>HP</b><em>{stats.hp}</em></span>
                  <span><b>MP</b><em>{stats.mp}</em></span>
                  <span><b>SAN</b><em>{stats.san}</em></span>
                  <span><b>Luck</b><em>{stats.luck}</em></span>
                </div>

                <button
                  className={`preset-attrs-toggle ${attrsExpanded ? 'expanded' : ''}`}
                  type="button"
                  aria-controls={`${preset.id}-other-panel`}
                  aria-expanded={attrsExpanded}
                  onClick={(event) => toggleAttrs(event, preset.id)}
                >
                  <ChevronDown size={15} />
                  其他属性
                </button>

                <div
                  className="preset-other-panel"
                  id={`${preset.id}-other-panel`}
                  hidden={!attrsExpanded}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="preset-attrs" aria-label={`${preset.name}完整属性`}>
                    {otherAttrRows.map(([key, label]) => (
                      <span key={key} title={label}>
                        <b>{key}</b>
                        <em>{preset.attrs[key]}</em>
                      </span>
                    ))}
                  </div>

                  <div className="preset-skill-list" aria-label={`${preset.name}技能`}>
                    {skillEntries.map(([name, value]) => (
                      <span key={name}>{name} {value}</span>
                    ))}
                  </div>
                </div>

                <div className="preset-background-notes">
                  <span>{preset.background.belief}</span>
                  <span>{preset.background.meaningfulItem}</span>
                  <span>{preset.background.trait}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
