import { useEffect, useRef } from 'react';
import type { DiceRollPresentation } from '../app/diceRollAnimation';
import type { GameState } from '../types/game';
import { gameAudio } from './audio';
import { getSoundscape } from './catalog';

export function AudioDirector({ screen, state, roll }: {
  screen: 'title' | 'setup' | 'game'; state: GameState; roll: DiceRollPresentation | null;
}) {
  const previousRoll = useRef<DiceRollPresentation | null>(null);
  const soundscape = getSoundscape(screen, state);
  useEffect(() => {
    const gesture = (event: Event) => { if (event.isTrusted) gameAudio.unlock(); };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>('button, [role="button"]');
      if (!target || target.matches(':disabled, [aria-disabled="true"]') || target.dataset.sound === 'none') return;
      gameAudio.play(target.dataset.sound === 'paper' ? 'paper' : 'click');
    };
    const visibility = () => gameAudio.setVisible(!document.hidden);
    const hide = () => gameAudio.setVisible(false);
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    visibility();
    return () => {
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      gameAudio.dispose();
    };
  }, []);
  useEffect(() => {
    gameAudio.setSoundscape(soundscape);
  }, [soundscape.music, soundscape.ambience]);
  useEffect(() => {
    const current = screen === 'game' ? roll : null;
    gameAudio.setDiceRolling(current?.phase === 'rolling');
    if (current?.phase === 'revealed' && previousRoll.current?.phase === 'rolling'
      && previousRoll.current.check === current.check) {
      gameAudio.play('diceLand');
      gameAudio.play(current.result.level === 'fail' || current.result.level === 'fumble' ? 'failure' : 'success');
    }
    previousRoll.current = current;
  }, [roll, screen]);
  return null;
}
