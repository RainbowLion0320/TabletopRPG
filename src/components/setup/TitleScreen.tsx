import { Play, Settings } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SaveSlot } from '../../types/game';
import fogVideo from '../../../assets/scenes/scene_main_fog_london.webm';
import fogPoster from '../../../assets/scenes/scene_main_fog_london.webp';
import { AudioSettingsButton } from '../shared/AudioSettingsButton';
import { continuationPreview } from '../../app/gameContinuation';
import './title-screen.css';

interface TitleScreenProps {
  hasSaves: boolean;
  onNewGame: () => void;
  onLoadLatest: () => void;
  onOpenApi: () => void;
  latestSave?: SaveSlot;
  continuation?: ReturnType<typeof continuationPreview>;
}

export function TitleScreen({ hasSaves, latestSave, continuation, onLoadLatest, onNewGame, onOpenApi }: TitleScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
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
      if (motion.matches || document.hidden) video.pause();
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
  }, []);
  const newAction = <button key="new" ref={hasSaves ? undefined : primaryRef} className={hasSaves ? 'ghost-btn' : 'primary-btn'} onClick={onNewGame}>
    <Play size={18} aria-hidden="true" />开始游戏
  </button>;
  const continueAction = <button key="continue" ref={hasSaves ? primaryRef : undefined} className={hasSaves ? 'primary-btn' : 'ghost-btn'}
    disabled={!hasSaves} onClick={onLoadLatest}>{preview?.completed ? '回顾调查' : '继续游戏'}</button>;
  return (
    <section className="title-screen">
      <div className="title-backdrop" aria-hidden="true">
        <video ref={videoRef} src={fogVideo} poster={fogPoster} muted loop playsInline preload="auto" disablePictureInPicture />
      </div>
      <div className="title-content">
        <p className="title-kicker">DISAPPEAR IN FOG · AI TRPG</p>
        <h1>雾中消逝</h1>
        <p className="title-subtitle">1920 年伦敦，煤气灯下的失踪案正在等待调查员。</p>
        {preview && <section className="title-resume-preview" aria-label="继续调查摘要">
          <div><span>{preview.label}</span><span>{preview.detail}</span></div>
          <strong>{preview.scene}</strong><p>{preview.players}</p>
        </section>}
        <div className="title-actions">
          {hasSaves ? <>{continueAction}{newAction}</> : <>{newAction}{continueAction}</>}
          <button className="ghost-btn subtle" onClick={onOpenApi}>
            <Settings size={16} />
            AI 设置
          </button>
          <AudioSettingsButton className="ghost-btn subtle" />
        </div>
      </div>
    </section>
  );
}
