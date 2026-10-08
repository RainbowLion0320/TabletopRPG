import { ChevronDown, Music2, Volume2, X } from 'lucide-react';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { gameAudio } from '../../audio/audio';
import { useDialogFocus } from './useDialogFocus';
import './audio-settings.css';

export function AudioSettingsButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const settings = useSyncExternalStore(gameAudio.subscribe, gameAudio.getSnapshot);
  const volumeId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, dialogRef, () => setOpen(false), openerRef);
  return <>
    <button ref={openerRef} type="button" className={className} aria-label="声音设置"
      title={iconOnly ? '声音设置' : undefined} onClick={() => setOpen(true)}>
      <Volume2 size={iconOnly ? 18 : 16} aria-hidden="true" />{!iconOnly && '声音设置'}
    </button>
    {open && createPortal(
      <div className="modal-backdrop audio-settings-backdrop" onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <div className="modal-card audio-settings" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="audio-settings-title" tabIndex={-1}>
          <header>
            <h2 id="audio-settings-title">声音设置</h2>
            <button className="audio-close" aria-label="关闭声音设置" onClick={() => setOpen(false)}><X size={20} /></button>
          </header>
          <div className="audio-settings-body">
          <section className="audio-channel" aria-label="背景音乐设置">
            <div className="audio-channel-heading">
              <span><Music2 size={18} />背景音乐</span>
              <button type="button" className="audio-switch" role="switch" aria-label="背景音乐" aria-checked={settings.musicEnabled} data-sound="none"
                onClick={() => { gameAudio.updateSettings({ musicEnabled: !settings.musicEnabled }); gameAudio.unlock(); }}>
                <span aria-hidden="true" className="audio-switch-track"><i /></span>{settings.musicEnabled ? '开启' : '关闭'}
              </button>
            </div>
            <label htmlFor={`${volumeId}-music`}>音乐音量 <output htmlFor={`${volumeId}-music`}>{Math.round(settings.musicVolume * 100)}%</output>
              <input id={`${volumeId}-music`} type="range" min="0" max="100" step="1" aria-label="音乐音量"
                aria-valuetext={`${Math.round(settings.musicVolume * 100)}%`} disabled={!settings.musicEnabled}
                value={Math.round(settings.musicVolume * 100)} onChange={(event) => gameAudio.updateSettings({ musicVolume: Number(event.target.value) / 100 })} />
            </label>
          </section>
          <section className="audio-channel" aria-label="音效设置">
            <div className="audio-channel-heading">
              <span><Volume2 size={18} />游戏音效</span>
              <button type="button" className="audio-switch" role="switch" aria-label="游戏音效" aria-checked={settings.effectsEnabled} data-sound="none"
                onClick={() => { gameAudio.updateSettings({ effectsEnabled: !settings.effectsEnabled }); gameAudio.unlock(); }}>
                <span aria-hidden="true" className="audio-switch-track"><i /></span>{settings.effectsEnabled ? '开启' : '关闭'}
              </button>
            </div>
            <p>骰子、翻页、操作与场景环境音。</p>
            <label htmlFor={`${volumeId}-effects`}>音效音量 <output htmlFor={`${volumeId}-effects`}>{Math.round(settings.effectsVolume * 100)}%</output>
              <input id={`${volumeId}-effects`} type="range" min="0" max="100" step="1" aria-label="音效音量"
                aria-valuetext={`${Math.round(settings.effectsVolume * 100)}%`} disabled={!settings.effectsEnabled}
                value={Math.round(settings.effectsVolume * 100)} onChange={(event) => gameAudio.updateSettings({ effectsVolume: Number(event.target.value) / 100 })} />
            </label>
            <button type="button" className="ghost-btn audio-preview" data-sound="none" disabled={!settings.effectsEnabled || settings.effectsVolume === 0}
              onClick={() => gameAudio.play('diceLand')}>试听骰子音效</button>
          </section>
          <p className="audio-note">设置自动记住。切到后台时暂停声音。</p>
          <details className="audio-credits">
            <summary>音乐与音效鸣谢<ChevronDown size={18} aria-hidden="true" /></summary>
            <div className="audio-credit-item">
              <div className="audio-credit-links"><a href="https://incompetech.com/" target="_blank" rel="noreferrer">Kevin MacLeod</a>
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></div>
              <p>配乐：“Darkest Child”、“Comfortable Mystery”、“Long note One”。已剪辑、调整响度并制作循环。</p>
            </div>
            <div className="audio-credit-item">
              <div className="audio-credit-links"><a href="https://kenney.nl/assets" target="_blank" rel="noreferrer">Kenney</a>
                <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0</a></div>
              <p>骰子、界面与翻书音效。环境音与检定提示音由项目合成。</p>
            </div>
          </details>
          </div>
        </div>
      </div>, document.body)}
  </>;
}
