import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '../../types/game';
import { storyData } from '../../data/storyData';

interface SceneStageProps {
  state: GameState;
}

function SceneBackdrop({ src }: { src: string }) {
  const lastLoaded = useRef<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  useLayoutEffect(() => {
    // Keep the last decoded scene behind a new picture until it is ready.
    setRetiring(lastLoaded.current !== src ? lastLoaded.current : null);
    setFailed(null);
  }, [src]);
  useEffect(() => {
    if (!retiring || loaded !== src) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
    const timer = window.setTimeout(() => setRetiring(null), delay);
    return () => window.clearTimeout(timer);
  }, [retiring, loaded, src]);
  return <>
    {retiring && <img className="scene-backdrop-retiring" src={retiring} alt="" aria-hidden="true" />}
    {failed !== src && <img key={src} className={`scene-backdrop-img ${loaded === src ? 'scene-image-arriving' : 'scene-image-loading'}`}
      src={src} alt="" onLoad={() => { lastLoaded.current = src; setLoaded(src); }}
      onError={() => { lastLoaded.current = null; setFailed(src); setRetiring(null); }} />}
  </>;
}

function ScenePortrait({ src }: { src: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (status === 'failed') return null;
  return <img className={`scene-npc ${status === 'ready' ? 'scene-image-arriving' : 'scene-image-loading'}`}
    src={src} alt="" onLoad={() => setStatus('ready')} onError={() => setStatus('failed')} />;
}

export function SceneStage({ state }: SceneStageProps) {
  const scene = storyData.scenes[state.currentScene];
  const activeNpcName = state.activeNpcName && scene.npcs.includes(state.activeNpcName)
    ? state.activeNpcName
    : null;
  const npc = activeNpcName ? storyData.npcs[activeNpcName] : null;

  return (
    <div className="scene-stage">
      <SceneBackdrop src={scene.image} />
      <div className="scene-shade" />
      {npc?.portrait ? (
        <ScenePortrait key={npc.portrait} src={npc.portrait} />
      ) : null}
    </div>
  );
}
