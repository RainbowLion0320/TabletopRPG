/**
 * Test fixtures shared across DM unit tests.
 *
 * Avoid pulling preset/portrait modules so tests stay snappy and don't
 * load real image assets. Construct minimal but type-correct objects.
 */

import type {
  ConversationTurn,
  GameState,
  Investigator,
  PersistedDMEvent,
  PersistedPendingConsequence,
  SceneId,
  SkillValue
} from '../../src/types/game';
import { allSkills } from '../../src/data/skills';
import { deriveInvestigatorStats, resolveSkillBase } from '../../src/data/gameRules';

const BASE_ATTRS = {
  STR: 60,
  CON: 60,
  SIZ: 50,
  DEX: 60,
  APP: 50,
  INT: 60,
  POW: 60,
  EDU: 60,
  Luck: 50
} as const;

/**
 * Build a minimal Investigator. `skillOverrides` is `name -> total` (not delta).
 */
export function makeInvestigator(
  partial: Partial<Investigator> & { name: string; id?: string },
  skillOverrides: Record<string, number> = {}
): Investigator {
  const attrs = { ...BASE_ATTRS, ...(partial.attrs ?? {}) };
  const derived = deriveInvestigatorStats(attrs);
  const skills: Record<string, SkillValue> = {};
  for (const skill of allSkills) {
    const base = resolveSkillBase(skill.base, attrs);
    const total = skillOverrides[skill.name] ?? base;
    skills[skill.name] = { base, added: Math.max(0, total - base) };
  }
  for (const [name, total] of Object.entries(skillOverrides)) {
    if (!skills[name]) skills[name] = { base: 0, added: total };
  }
  return {
    id: partial.id ?? `pid-${partial.name}`,
    name: partial.name,
    gender: partial.gender ?? '男',
    age: partial.age ?? 30,
    hometown: partial.hometown ?? '伦敦',
    job: partial.job ?? '调查员',
    attrs,
    hp: derived.hp,
    mp: derived.mp,
    san: derived.san,
    luck: derived.luck,
    currentHp: partial.currentHp ?? derived.hp,
    currentMp: partial.currentMp ?? derived.mp,
    currentSan: partial.currentSan ?? derived.san,
    skills,
    background: partial.background
  };
}

export interface MakeStateOptions {
  players?: Investigator[];
  currentScene?: SceneId;
  flags?: Record<string, unknown>;
  clueIds?: string[];
  conversationHistory?: ConversationTurn[];
  activeNpcName?: string | null;
  pendingConsequences?: PersistedPendingConsequence[];
  eventLog?: PersistedDMEvent[];
}

/**
 * Build a minimal GameState that satisfies the type. Not for reducer tests
 * that need full normalization; fine for KB/contextBuilder/director tests.
 */
export function makeState(options: MakeStateOptions = {}): GameState {
  const players = options.players ?? [makeInvestigator({ name: '亨利' })];
  const playerLocations: Record<string, SceneId> = {};
  for (const p of players) playerLocations[p.id] = options.currentScene ?? 'S01';
  const clues = (options.clueIds ?? []).map((cid) => ({
    id: cid,
    name: cid,
    scene: 'S01' as SceneId,
    desc: '',
    found: true
  }));
  return {
    players,
    exploreMode: 'together',
    currentSplitPlayer: 0,
    currentActorIndex: 0,
    playerLocations,
    declarations: {},
    pendingCheck: null,
    currentScene: options.currentScene ?? 'S01',
    activeNpcName: options.activeNpcName ?? null,
    clues,
    flags: options.flags ?? {},
    actionLog: [],
    conversationHistory: options.conversationHistory ?? [],
    messages: [],
    suggestions: [],
    suggestionsByPlayerId: {},
    isThinking: false,
    longTermMemorySummary: '',
    summarizedUntilIndex: 0,
    eventLog: options.eventLog ?? [],
    pendingConsequences: options.pendingConsequences ?? []
  };
}
