import { gameStorage, flushGameStorage } from '../platform/storage';
import { hydrateGameState } from '../state/gameReducer';
import { evaluateD100 } from '../services/dice';
import { storyData } from '../data/storyData';
import type { GameState, SaveSlot } from '../types/game';
import type { DiceRollPresentation } from '../app/diceRollAnimation';

export const SESSION_KEY = 'trpg-android-session-v1';
export interface MobileSession { version: 1; savedAt: number; state: GameState; roll: DiceRollPresentation | null }

export function parseMobileSession(raw: string | null): MobileSession | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as MobileSession;
  if (parsed?.version !== 1 || !Number.isFinite(parsed.savedAt) || !parsed.state) throw new Error('自动续玩记录版本无效。');
  const state = hydrateGameState(parsed.state);
  if (!state.players.length) return null;
  let roll: DiceRollPresentation | null = null;
  if (parsed.roll) {
    const check = state.pendingCheck;
    const savedCheck = parsed.roll.check;
    const value = parsed.roll.result?.roll;
    if (!check || !savedCheck || savedCheck.player !== check.player || savedCheck.skill !== check.skill
      || savedCheck.scenarioCheckId !== check.scenarioCheckId || savedCheck.batchIndex !== check.batchIndex
      || !Number.isInteger(value) || value < 1 || value > 100) throw new Error('已锁定的骰子记录不完整，请读取手动存档。');
    roll = { check, result: evaluateD100(check, value), phase: 'revealed' };
  }
  return { version: 1, savedAt: parsed.savedAt, state: { ...state, isThinking: false }, roll };
}

export const readMobileSession = () => parseMobileSession(gameStorage.getItem(SESSION_KEY));
export async function writeMobileSession(state: GameState, roll: DiceRollPresentation | null): Promise<MobileSession> {
  const session: MobileSession = { version: 1, savedAt: Date.now(), state, roll };
  gameStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await flushGameStorage();
  return session;
}
export function sessionSaveSlot(session: MobileSession): SaveSlot {
  return { id: session.savedAt, savedAt: new Date(session.savedAt).toLocaleString('zh-CN'),
    scene: storyData.scenes[session.state.currentScene].name,
    players: session.state.players.map(player => player.name).join('、'), gameState: session.state, version: 8 };
}
