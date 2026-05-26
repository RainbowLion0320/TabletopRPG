import { useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { createInvestigatorFromPreset, presets } from '../../data/presets';
import type { Investigator } from '../../types/game';

interface CharacterSetupProps {
  onBack: () => void;
  onStart: (players: Investigator[]) => void;
}

export function CharacterSetup({ onBack, onStart }: CharacterSetupProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => presets.slice(0, 2).map((item) => item.id));
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
          return (
            <button
              key={preset.id}
              className={`preset-card-modern ${selected ? 'selected' : ''}`}
              onClick={() => toggle(preset.id)}
            >
              <span className="preset-select-mark">{selected ? '已选' : '选择'}</span>
              <strong>{preset.name}</strong>
              <small>{preset.role}</small>
              <p>{preset.desc}</p>
              <div className="preset-stats">
                <span>HP {Math.floor((preset.attrs.CON + preset.attrs.SIZ) / 10)}</span>
                <span>SAN {preset.attrs.POW}</span>
                <span>Luck {preset.attrs.Luck}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
