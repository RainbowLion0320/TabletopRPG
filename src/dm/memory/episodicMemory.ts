/**
 * Episodic Memory Retrieval - local RAG-style long-tail recall.
 *
 * This layer deliberately stays non-authoritative: retrieved episodes help the
 * Narrator remember prior interactions, but reducer state / facts / secrets
 * remain the source of truth.
 */

import type {
  AtomicFact,
  EpisodicMemoryRecord,
  PersistedDMEvent,
  RetrievedEpisodicMemory,
  SceneId
} from '../../types/game';
import type { IntentKind } from '../intentClassifier';
import type { PlayerAction } from '../../services/aiDm';

export const EPISODIC_MEMORY_CAP = 300;

export interface EpisodicSearchQuery {
  query: string;
  sceneId?: SceneId;
  entityIds?: string[];
  playerNames?: string[];
  tags?: string[];
  maxTurnExclusive?: number;
  limit?: number;
  includeDmOnly?: boolean;
}

export interface BuildEpisodicMemoryRecordInput {
  turn: number;
  sceneId: SceneId;
  actions: PlayerAction[];
  narrative: string;
  events: PersistedDMEvent[];
  facts: AtomicFact[];
  activeNpcName?: string | null;
}

const HISTORY_KEYWORDS = [
  '之前',
  '以前',
  '上次',
  '刚才',
  '记得',
  '回忆',
  '承诺',
  '答应',
  '说过',
  '提到',
  '怀疑',
  '线索',
  '私人信件',
  '旧事'
];

export function shouldRetrieveEpisodicMemory(
  intentKind: IntentKind,
  actions: PlayerAction[]
): boolean {
  if (intentKind === 'social' || intentKind === 'research') return true;
  const text = actions.map((a) => a.action).join('\n');
  return HISTORY_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function buildEpisodicMemoryQuery(actions: PlayerAction[]): string {
  return actions.map((a) => `${a.player}：${a.action}`).join('\n');
}

export function searchEpisodicMemory(
  records: readonly EpisodicMemoryRecord[],
  query: EpisodicSearchQuery
): RetrievedEpisodicMemory[] {
  const limit = query.limit ?? 5;
  const queryTokens = tokenize(query.query);
  const queryTokenSet = new Set(queryTokens);
  const requestedEntities = new Set(query.entityIds ?? []);
  const requestedPlayers = new Set(query.playerNames ?? []);
  const requestedTags = new Set(query.tags ?? []);

  return records
    .flatMap((record): RetrievedEpisodicMemory[] => {
      if (query.maxTurnExclusive !== undefined && record.turn >= query.maxTurnExclusive) return [];
      if (query.includeDmOnly === false && record.visibility === 'dm') return [];

      const reasons: string[] = [];
      const recordTokens = tokenize(record.text);
      const overlap = countOverlap(queryTokenSet, recordTokens);
      let score = overlap * 2;
      if (overlap > 0) reasons.push('text');

      const entityOverlap = countSetOverlap(requestedEntities, record.entityIds);
      if (entityOverlap) {
        score += entityOverlap * 3;
        reasons.push('entity');
      }

      const playerOverlap = countSetOverlap(requestedPlayers, record.playerNames);
      if (playerOverlap) {
        score += playerOverlap;
        reasons.push('player');
      }

      const tagOverlap = countSetOverlap(requestedTags, record.tags);
      if (tagOverlap) {
        score += tagOverlap * 1.5;
        reasons.push('tag');
      }

      if (query.sceneId && record.sceneId === query.sceneId) {
        score += 1.25;
        reasons.push('scene');
      }

      score += Math.max(0, Math.min(record.importance, 5)) * 0.4;
      // Player-only matches are too broad; require textual or stronger metadata evidence.
      if (overlap === 0 && entityOverlap === 0 && tagOverlap === 0 && reasons.every((r) => r === 'player')) {
        return [];
      }
      if (score <= 0) return [];
      return [{ record, score, reasons }];
    })
    .sort((a, b) => b.score - a.score || b.record.turn - a.record.turn)
    .slice(0, limit);
}

export function buildEpisodicMemoryRecord(
  input: BuildEpisodicMemoryRecordInput
): EpisodicMemoryRecord | null {
  const narrative = input.narrative.trim();
  if (!narrative && !input.actions.length) return null;

  const playerNames = unique(input.actions.map((a) => a.player).filter(Boolean));
  const entityIds = collectEntityIds(input, new Set(playerNames));
  const tags = collectTags(input);
  const text = compactText([
    input.actions.length
      ? `玩家行动：${input.actions.map((a) => `${a.player}：${a.action}`).join('；')}`
      : '',
    narrative ? `DM叙事：${narrative}` : '',
    input.events.length
      ? `事件：${input.events.slice(0, 4).map((e) => `${e.kind}:${e.description}`).join('；')}`
      : '',
    input.facts.length
      ? `事实：${input.facts.slice(0, 4).map(formatFact).join('；')}`
      : ''
  ]);
  if (!text) return null;

  return {
    id: `em_${input.turn}_${stableHash(text)}`,
    turn: input.turn,
    sceneId: input.sceneId,
    text,
    playerNames,
    entityIds,
    tags,
    source: 'episode',
    visibility: 'dm',
    importance: estimateImportance(input)
  };
}

function collectEntityIds(input: BuildEpisodicMemoryRecordInput, playerNames: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  if (input.activeNpcName) ids.push(input.activeNpcName);
  for (const fact of input.facts) {
    if (fact.actor && !playerNames.has(fact.actor) && fact.actor !== 'world') ids.push(fact.actor);
    if (fact.target && !playerNames.has(fact.target) && fact.target !== 'world') ids.push(fact.target);
  }
  return unique(ids);
}

function collectTags(input: BuildEpisodicMemoryRecordInput): string[] {
  const tags = new Set<string>();
  if (input.narrative.trim()) tags.add('narrative');
  for (const fact of input.facts) tags.add(fact.predicate);
  for (const event of input.events) tags.add(event.kind);
  const allText = `${input.narrative}\n${input.actions.map((a) => a.action).join('\n')}`;
  for (const keyword of HISTORY_KEYWORDS) {
    if (allText.includes(keyword)) tags.add(keyword);
  }
  return Array.from(tags).slice(0, 12);
}

function estimateImportance(input: BuildEpisodicMemoryRecordInput): number {
  let score = 1;
  if (input.facts.some((f) => f.predicate === 'stance_toward' || f.predicate === 'relationship')) score += 1;
  if (input.events.some((e) => e.kind === 'secret_reveal' || e.kind === 'scene_change' || e.kind === 'consequence')) score += 2;
  const text = `${input.narrative}\n${input.actions.map((a) => a.action).join('\n')}`;
  if (HISTORY_KEYWORDS.some((keyword) => text.includes(keyword))) score += 1;
  return Math.max(0, Math.min(score, 5));
}

function formatFact(fact: AtomicFact): string {
  const target = fact.target ? `→${fact.target}` : '';
  return `${fact.actor}${target} ${fact.predicate}: ${fact.value}`;
}

function compactText(parts: string[]): string {
  return parts
    .filter((p) => p.trim())
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const ascii = normalized.match(/[a-z0-9_]+/g) ?? [];
  const cjk = Array.from(normalized.matchAll(/[\u4e00-\u9fff]/g)).map((m) => m[0]);
  const cjkBigrams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i += 1) {
    cjkBigrams.push(`${cjk[i]}${cjk[i + 1]}`);
  }
  return [...ascii, ...cjk, ...cjkBigrams].filter((token) => token.trim().length > 0);
}

function countOverlap(needle: ReadonlySet<string>, haystack: readonly string[]): number {
  if (!needle.size || !haystack.length) return 0;
  const hay = new Set(haystack);
  let count = 0;
  for (const token of needle) {
    if (hay.has(token)) count += 1;
  }
  return count;
}

function countSetOverlap(needle: ReadonlySet<string>, haystack: readonly string[]): number {
  if (!needle.size || !haystack.length) return 0;
  let count = 0;
  for (const item of haystack) {
    if (needle.has(item)) count += 1;
  }
  return count;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim())));
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
