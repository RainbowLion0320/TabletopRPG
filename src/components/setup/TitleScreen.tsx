import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SaveSlot } from '../../types/game';
import fogVideo from '../../../assets/ui/artist/title-rain.webm';
import fogPoster from '../../../assets/ui/artist/title-background.webp';
import titleLogo from '../../../assets/ui/artist/title-logo.webp';
import newArt from '../../../assets/ui/artist/home-new.webp';
import continueArt from '../../../assets/ui/artist/home-continue.webp';
import { AudioSettingsButton } from '../shared/AudioSettingsButton';
import { TuningDialArt } from '../shared/TuningDialArt';
import { continuationPreview } from '../../app/gameContinuation';
import './title-screen.css';

interface TitleScreenProps {
  hasSaves: boolean;
  onNewGame: () => void;
  onLoadLatest: () => void;
  onOpenApi: () => void;
  latestSave?: SaveSlot;
  continuation?: ReturnType<typeof continuationPreview>;
  overlayOpen?: boolean;
}

export function TitleScreen({ hasSaves, latestSave, continuation, onLoadLatest, onNewGame, onOpenApi, overlayOpen = false }: TitleScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [audioOpen, setAudioOpen] = useState(false);
  const covered = overlayOpen || audioOpen;
  const preview = continuation ?? (latestSave ? { ...continuationPreview(latestSave.gameState, '最近存档'),
    players: latestSave.players, detail: latestSave.savedAt } : null);
  useLayoutEffect(() => {
    if (document.activeElement === document.body) primaryRef.current?.focus({ preventScroll: true });
  }, [hasSaves]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window.matchMedia !== 'function') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePlayback = () => {
      if (covered || motion.matches || document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    updatePlayback();
    motion.addEventListener('change', updatePlayback);
    document.addEventListener('visibilitychange', updatePlayback);
    return () => {
      motion.removeEventListener('change', updatePlayback);
      document.removeEventListener('visibilitychange', updatePlayback);
      video.pause();
    };
  }, [covered]);
  const newAction = <button ref={hasSaves ? undefined : primaryRef} className="primary-btn title-new" aria-label="开始游戏" onClick={onNewGame}>
    <img src={newArt} alt="" aria-hidden="true" /><span className="ui-visually-hidden">开始游戏</span>
  </button>;
  const continueAction = <button ref={hasSaves ? primaryRef : undefined} className="ghost-btn title-continue"
    disabled={!hasSaves} onClick={onLoadLatest}>
    {preview?.completed ? <span className="title-completed-label">回顾调查</span>
      : <><img src={continueArt} alt="" aria-hidden="true" /><span className="ui-visually-hidden">继续游戏</span></>}
  </button>;
  return (
    <section className="title-screen">
      <div className="title-backdrop" aria-hidden="true">
        <video ref={videoRef} src={fogVideo} poster={fogPoster} muted loop playsInline preload="metadata" disablePictureInPicture />
      </div>
      <div className="title-content">
        <h1 className="ui-visually-hidden">雾中消逝</h1>
        <img className="title-mark" src={titleLogo} alt="" aria-hidden="true" />
        {preview && <section className="title-resume-preview" aria-label="继续调查摘要">
          <div><span>{preview.label}</span><span>{preview.detail}</span></div>
          <strong>{preview.scene}</strong><p>{preview.players}</p>
        </section>}
        <div className="title-actions">
          {newAction}{hasSaves && continueAction}
        </div>
      </div>
      <nav className="title-utilities" aria-label="游戏设置">
        <button type="button" className="icon-text-btn audio-icon-button title-settings" aria-label="AI 设置" title="AI 设置" aria-haspopup="dialog" onClick={onOpenApi}>
          <TuningDialArt size={24} />
        </button>
        <AudioSettingsButton className="icon-text-btn audio-icon-button title-audio" iconOnly onOpenChange={setAudioOpen} />
      </nav>
    </section>
  );
}
