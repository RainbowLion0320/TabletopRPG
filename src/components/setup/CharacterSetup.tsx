import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { deriveInvestigatorStats } from '../../data/gameRules';
import { createInvestigatorFromPreset, presets } from '../../data/presets';
import type { Investigator } from '../../types/game';
import { AudioSettingsButton } from '../shared/AudioSettingsButton';
import './character-setup.css';

interface CharacterSetupProps {
  portrait?: boolean;
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

export function CharacterSetup({ onBack, onStart, portrait = false }: CharacterSetupProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => presets.slice(0, 1).map((item) => item.id));
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

  function toggleAttrs(id: string) {
    setExpandedAttrIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  return (
    <section className={`setup-screen${portrait ? ' setup-portrait' : ''}`}>
      <header className="setup-header">
        <button className="icon-text-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          返回
        </button>
        <div className="setup-heading">
          <p className="eyebrow">INVESTIGATORS</p>
          <h1>选择调查员</h1>
        </div>
        <div className="setup-header-actions">
          <AudioSettingsButton className="icon-text-btn audio-icon-button" iconOnly />
        </div>
      </header>

      <p className="setup-intro">独自调查，或与朋友轮流行动。</p>

      <div className="preset-grid-modern">
        {presets.map((preset) => {
          const selected = selectedIds.includes(preset.id);
          const attrsExpanded = expandedAttrIds.includes(preset.id);
          const stats = deriveInvestigatorStats(preset.attrs);
          const skillEntries = Object.entries(preset.skills).sort((left, right) => right[1] - left[1]);
          const specialties = skillEntries.filter(([name]) => name !== '母语').slice(0, 2);
          return (
            <article
              key={preset.id}
              className={`preset-card-modern ${selected ? 'selected' : ''} ${attrsExpanded ? 'attrs-expanded' : ''}`}
              aria-label={`${preset.name}档案`}
            >
              <label className="preset-selection">
                <input className="preset-selection-input" type="checkbox" checked={selected} onChange={() => toggle(preset.id)} aria-label={`选择${preset.name}`} />
                <span className="preset-select-mark"><Check size={13} aria-hidden="true" />{selected ? '已选' : '选择'}</span>
                <div className="preset-portrait-frame">
                  <img src={preset.portrait} alt={`${preset.name} 立绘`} />
                </div>
                <div className="preset-card-content">
                  <strong>{preset.name}</strong>
                  <small>{preset.role} · {preset.gender} · {preset.age}岁 · {preset.hometown}</small>
                  <p>{preset.desc}</p>
                  <div className="preset-specialties" aria-label={`${preset.name}擅长技能`}>
                    {specialties.map(([name, value]) => <span key={name}>{name}<em>{value}</em></span>)}
                  </div>
                  <div className="preset-vitals" aria-label={`${preset.name}派生数值`}>
                    <span title="生命（HP）"><b>生命</b><em>{stats.hp}</em></span>
                    <span title="魔力（MP）"><b>魔力</b><em>{stats.mp}</em></span>
                    <span title="理智（SAN）"><b>理智</b><em>{stats.san}</em></span>
                    <span><b>幸运</b><em>{stats.luck}</em></span>
                  </div>
                </div>
              </label>

              <div className="preset-card-actions">
                <button
                  className={`preset-attrs-toggle ${attrsExpanded ? 'expanded' : ''}`}
                  type="button"
                  aria-controls={`${preset.id}-other-panel`}
                  aria-expanded={attrsExpanded}
                  onClick={() => toggleAttrs(preset.id)}
                >
                  <ChevronDown size={15} />
                  {attrsExpanded ? '收起档案' : '档案详情'}
                </button>
              </div>

                <div
                  className="preset-other-panel"
                  id={`${preset.id}-other-panel`}
                  hidden={!attrsExpanded}
                >
                  <div className="preset-attrs" aria-label={`${preset.name}完整属性`}>
                    {otherAttrRows.map(([key, label]) => (
                      <span key={key}>
                        <b>{label}<small>{key}</small></b>
                        <em>{preset.attrs[key]}</em>
                      </span>
                    ))}
                  </div>

                  <div className="preset-skill-list" aria-label={`${preset.name}技能`}>
                    {skillEntries.map(([name, value]) => (
                      <span key={name}>{name} {value}</span>
                    ))}
                  </div>
                <div className="preset-background-notes">
                  <span>{preset.background.belief}</span>
                  <span>{preset.background.meaningfulItem}</span>
                  {preset.equipment.length ? <span>装备：{preset.equipment.join('、')}</span> : null}
                  <span>{preset.background.trait}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="setup-footer">
        <div className="setup-party-summary" aria-live="polite">
          <span>已选择 <strong>{selectedPlayers.length}</strong> 名调查员</span>
          <small>{selectedPlayers.length === 0 ? '请选择一位调查员' : selectedPlayers.length === 1 ? '单人调查' : '轮流行动'}</small>
        </div>
        <button className="primary-btn" disabled={!selectedPlayers.length} onClick={() => onStart(selectedPlayers)}>
          <Check size={18} />进入游戏
        </button>
      </footer>
    </section>
  );
}
