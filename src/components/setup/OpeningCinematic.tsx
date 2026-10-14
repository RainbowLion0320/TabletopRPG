import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { App as NativeApp } from '@capacitor/app';
import { Volume2 } from 'lucide-react';
import { isNativeAndroid } from '../../android/native';
import { gameAudio } from '../../audio/audio';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useOverlayPresence } from '../shared/useOverlayPresence';
import './opening-cinematic.css';

const portrait = { video: new URL('../../../assets/cinematics/opening-portrait.mp4', import.meta.url).href,
  poster: new URL('../../../assets/cinematics/opening-portrait-poster.webp', import.meta.url).href };
const landscape = import.meta.env.ANDROID_PUBLIC_NATIVE_BUNDLE ? portrait : {
  video: new URL('../../../assets/cinematics/opening-landscape.mp4', import.meta.url).href,
  poster: new URL('../../../assets/cinematics/opening-landscape-poster.webp', import.meta.url).href };
const music = new URL('../../../assets/cinematics/opening-music.m4a', import.meta.url).href;
const effects = new URL('../../../assets/cinematics/opening-effects.m4a', import.meta.url).href;
type FinishReason = 'finished' | 'skipped' | 'unavailable';

export function OpeningCinematic({ open, onFinish, returnFocusRef }: {
  open: boolean; onFinish: (reason: FinishReason) => void; returnFocusRef: RefObject<HTMLElement>;
}) {
  // Freeze the selected composition for this playback: rotation must not restart its timeline.
  const [media] = useState(() => window.innerHeight >= window.innerWidth ? portrait : landscape);
  const reason = useRef<FinishReason>('finished');
  const motion = useOverlayPresence(open, open, reason.current === 'finished' ? 650 : 240);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null), effectsRef = useRef<HTMLAudioElement>(null);
  const active = useRef(open); active.current = open;
  const nativeActive = useRef(true);
  const playVersion = useRef(0);
  const completed = useRef(false);
  const stallTimer = useRef<number | undefined>(undefined);
  const [waiting, setWaiting] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const settings = useSyncExternalStore(gameAudio.subscribe, gameAudio.getSnapshot);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;

  function clearStall() { window.clearTimeout(stallTimer.current); stallTimer.current = undefined; }
  function stopAudio() { musicRef.current?.pause(); effectsRef.current?.pause(); }
  function finish(value: FinishReason) {
    if (!active.current || completed.current) return;
    completed.current = true; reason.current = value;
    playVersion.current++;
    clearStall(); videoRef.current?.pause(); stopAudio();
    finishRef.current(value);
  }
  useDialogFocus(open, dialogRef, () => finish('skipped'), returnFocusRef, {
    getFallbackFocus: () => document.querySelector<HTMLElement>('.title-actions button')
  });
  function isVisible() { return active.current && nativeActive.current && !document.hidden; }
  function syncAudio() {
    const video = videoRef.current;
    if (!video || !isVisible() || video.paused || video.ended || video.readyState < 3) { stopAudio(); return; }
    const current = gameAudio.getSnapshot();
    const starts: Promise<void>[] = [];
    for (const [audio, enabled, volume] of [[musicRef.current, current.musicEnabled, current.musicVolume],
      [effectsRef.current, current.effectsEnabled, current.effectsVolume]] as const) {
      if (!audio) continue;
      audio.volume = enabled ? volume : 0;
      if (!enabled || volume === 0) { audio.pause(); continue; }
      if (audio.readyState < 1) continue;
      if (Math.abs(audio.currentTime - video.currentTime) > .12) {
        try { audio.currentTime = video.currentTime; } catch { continue; }
      }
      if (audio.paused) starts.push(audio.play().then(() => {
        const latest = gameAudio.getSnapshot();
        const allowed = audio === musicRef.current ? latest.musicEnabled && latest.musicVolume > 0
          : latest.effectsEnabled && latest.effectsVolume > 0;
        if (!isVisible() || video.paused || video.ended || video.readyState < 3 || !allowed) audio.pause();
        else gameAudio.unlock();
      }));
    }
    if (starts.length) void Promise.allSettled(starts).then(results => {
      if (isVisible()) setSoundBlocked(results.some(result => result.status === 'rejected'));
    });
  }
  function waitForMedia() {
    setWaiting(true); stopAudio();
    if (isVisible()) stallTimer.current ??= window.setTimeout(() => {
      if (isVisible()) finish('unavailable');
    }, 8_000);
  }
  useEffect(() => {
    const video = videoRef.current;
    if (!open || !video) { stopAudio(); return; }
    active.current = true;
    const ownedAudio = [musicRef.current, effectsRef.current];
    let disposed = false;
    const update = () => {
      if (disposed) return;
      const version = ++playVersion.current;
      if (!isVisible()) { clearStall(); video.pause(); stopAudio(); }
      else {
        if (video.readyState < 3) waitForMedia();
        void video.play().catch((error: unknown) => {
          // An Android visibility pause can reject an older play after a new resume.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (!disposed && version === playVersion.current && isVisible()) finish('unavailable');
        });
      }
    };
    const hide = () => { playVersion.current++; video.pause(); stopAudio(); clearStall(); };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', update);
    const listener = isNativeAndroid() ? NativeApp.addListener('appStateChange', ({ isActive }) => {
      nativeActive.current = isActive; update();
    }) : null;
    waitForMedia(); update();
    return () => {
      disposed = true;
      playVersion.current++;
      active.current = false;
      clearStall(); video.pause(); ownedAudio.forEach(audio => audio?.pause());
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', update);
      if (listener) void listener.then(handle => handle.remove());
    };
  }, [open]);
  useEffect(() => { syncAudio(); }, [settings]);
  if (!motion.present) return null;
  return createPortal(<div {...motion.layerProps} ref={dialogRef} className="opening-cinematic"
    role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label={open ? '开场动画' : undefined}
    tabIndex={-1} style={{ '--opening-exit': `${reason.current === 'finished' ? 650 : 240}ms` } as CSSProperties}>
    <video ref={videoRef} src={media.video} poster={media.poster} muted playsInline preload="auto" disablePictureInPicture
      aria-label="伦敦雨雾开场" onWaiting={waitForMedia} onStalled={waitForMedia} onPause={stopAudio}
      onPlaying={() => { clearStall(); setWaiting(false); syncAudio(); }}
      onTimeUpdate={syncAudio} onEnded={() => finish('finished')} onError={() => finish('unavailable')} />
    <audio ref={musicRef} src={music} preload="auto" onCanPlay={syncAudio} aria-hidden="true" />
    <audio ref={effectsRef} src={effects} preload="auto" onCanPlay={syncAudio} aria-hidden="true" />
    <div className="opening-status" role={open && waiting ? 'status' : undefined} hidden={!waiting}>
      载入开场<span aria-hidden="true">···</span>
    </div>
    <nav className="opening-controls" aria-label="开场控制">
      <button className="ghost-btn opening-skip" type="button" data-sound="none" onClick={() => finish('skipped')}>跳过开场</button>
      {soundBlocked && ((settings.musicEnabled && settings.musicVolume > 0) || (settings.effectsEnabled && settings.effectsVolume > 0))
        && <button className="ghost-btn opening-enable-sound" type="button" data-sound="none" onClick={syncAudio}><Volume2 size={18} aria-hidden="true" />开启声音</button>}
    </nav>
  </div>, document.body);
}
