import { allSkills } from '../data/skills';
import { caseBoard } from '../data/scenarios/wuzhongxiaoshi';
import { storyData } from '../data/storyData';
import { getVisibleCaseBoard } from '../dm/caseBoard';
import type { GameState, NarrativeKeywordHint } from '../types/game';
import { normalizeNarrativeKeywordHints } from './narrativeKeywords';

export type NarrativeMarkKind =
  | 'person'
  | 'location'
  | 'item'
  | 'skill'
  | 'success'
  | 'danger'
  | 'state'
  | 'clue';

export interface NarrativeMarkTarget {
  kind: NarrativeMarkKind;
  id: string;
  label: string;
  source: 'deterministic' | 'llm';
  canonicalName?: string;
  keywordKind?: NarrativeKeywordHint['kind'];
}

export interface NarrativeTextSegment {
  text: string;
  mark?: NarrativeMarkTarget;
}

interface TermDefinition {
  text: string;
  target: NarrativeMarkTarget;
  priority: number;
}

interface Candidate extends TermDefinition {
  start: number;
  end: number;
}

export const PERSON_COLORS = [
  '#f0b36a',
  '#73cde0',
  '#de8fb8',
  '#91d28b',
  '#d4b5ff',
  '#f38b7c',
  '#85b7f1',
  '#d8cf72',
  '#72d1b4',
  '#cba07a'
] as const;

const RESULT_TERMS: Array<[string, NarrativeMarkKind]> = [
  ['极难成功', 'success'],
  ['困难成功', 'success'],
  ['普通成功', 'success'],
  ['大成功', 'success'],
  ['大失败', 'danger'],
  ['检定成功', 'success'],
  ['检定失败', 'danger'],
  ['成功', 'success'],
  ['失败', 'danger'],
  ['极难难度', 'state'],
  ['困难难度', 'state'],
  ['普通难度', 'state'],
  ['极难检定', 'state'],
  ['困难检定', 'state'],
  ['普通检定', 'state'],
  ['临时疯狂', 'danger'],
  ['不定性疯狂', 'danger'],
  ['重伤', 'danger'],
  ['濒死', 'danger'],
  ['昏迷', 'danger'],
  ['中毒', 'danger'],
  ['恐慌', 'danger'],
  ['受伤', 'state'],
  ['疯狂', 'danger'],
  ['HP', 'state'],
  ['SAN', 'state']
];

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function canonicalPersonNames(state: GameState): string[] {
  return [...new Set([
    ...Object.keys(storyData.npcs),
    ...state.players.map((player) => player.name).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function buildPersonColorMap(state: GameState): Map<string, string> {
  const names = canonicalPersonNames(state);
  const used = new Set<number>();
  const result = new Map<string, string>();

  names.forEach((name) => {
    const initial = hashText(name) % PERSON_COLORS.length;
    let index = initial;
    for (let offset = 0; offset < PERSON_COLORS.length; offset += 1) {
      const candidate = (initial + offset) % PERSON_COLORS.length;
      if (!used.has(candidate)) {
        index = candidate;
        break;
      }
    }
    used.add(index);
    result.set(name, PERSON_COLORS[index]);
  });

  return result;
}

export function getPersonColor(state: GameState, canonicalName: string): string {
  return buildPersonColorMap(state).get(canonicalName)
    ?? PERSON_COLORS[hashText(canonicalName) % PERSON_COLORS.length];
}

function addTerm(
  terms: TermDefinition[],
  seen: Set<string>,
  text: string,
  target: NarrativeMarkTarget,
  priority = 100
) {
  const normalized = text.trim();
  if (normalized.length < 2) return;
  const key = `${normalized}\u0000${target.kind}\u0000${target.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  terms.push({ text: normalized, target, priority });
}

function deterministicTerms(state: GameState): TermDefinition[] {
  const terms: TermDefinition[] = [];
  const seen = new Set<string>();
  const visibleBoard = getVisibleCaseBoard(caseBoard, state);
  const visibleNpcNames = new Set(
    visibleBoard.nodes
      .filter((node) => node.type === 'npc' && node.refId)
      .map((node) => node.refId!)
  );
  const visibleSceneIds = new Set(
    visibleBoard.nodes
      .filter((node) => node.type === 'scene' && node.refId)
      .map((node) => node.refId!)
  );
  const visibleItemIds = new Set(
    visibleBoard.nodes
      .filter((node) => node.type === 'item' && node.refId)
      .map((node) => node.refId!)
  );
  if (state.activeNpcName) visibleNpcNames.add(state.activeNpcName);
  visibleSceneIds.add(state.currentScene);
  state.clues.forEach((clue) => visibleItemIds.add(clue.id));

  state.players.forEach((player) => {
    addTerm(terms, seen, player.name, {
      kind: 'person', id: player.id, label: player.name, source: 'deterministic', canonicalName: player.name
    }, 130);
  });

  Object.entries(storyData.npcs).forEach(([name, npc]) => {
    if (!visibleNpcNames.has(name)) return;
    const target: NarrativeMarkTarget = {
      kind: 'person', id: name, label: name, source: 'deterministic', canonicalName: name
    };
    addTerm(terms, seen, name, target, 130);
    npc.aliases?.forEach((alias) => addTerm(terms, seen, alias, target, 120));
  });

  Object.values(storyData.scenes).forEach((scene) => {
    if (!visibleSceneIds.has(scene.id)) return;
    const target: NarrativeMarkTarget = {
      kind: 'location', id: scene.id, label: scene.name, source: 'deterministic'
    };
    addTerm(terms, seen, scene.name, target, 110);
    scene.aliases?.forEach((alias) => addTerm(terms, seen, alias, target, 100));
  });

  Object.values(storyData.items).forEach((item) => {
    if (!visibleItemIds.has(item.id)) return;
    const target: NarrativeMarkTarget = {
      kind: 'item', id: item.id, label: item.name, source: 'deterministic'
    };
    addTerm(terms, seen, item.name, target, 110);
    addTerm(terms, seen, item.id, target, 90);
    item.aliases?.forEach((alias) => addTerm(terms, seen, alias, target, 100));
  });

  for (const node of state.caseBoard?.nodes ?? []) {
    if (node.status !== 'active') continue;
    const target: NarrativeMarkTarget = {
      kind: node.type === 'npc' ? 'person' : node.type === 'scene' ? 'location' : 'clue',
      id: `caseboard:${node.id}`,
      label: node.title,
      source: 'deterministic',
      canonicalName: node.type === 'npc' ? node.title : undefined
    };
    addTerm(terms, seen, node.title, target, 105);
  }

  allSkills.forEach((skill) => addTerm(terms, seen, skill.name, {
    kind: 'skill', id: skill.name, label: skill.name, source: 'deterministic'
  }, 100));

  RESULT_TERMS.forEach(([text, kind]) => addTerm(terms, seen, text, {
    kind, id: text, label: text, source: 'deterministic'
  }, 80));

  return terms;
}

function llmTerms(text: string, keywords: unknown): TermDefinition[] {
  return normalizeNarrativeKeywordHints(keywords, text).map((keyword) => ({
    text: keyword.text,
    priority: 10,
    target: {
      kind: keyword.kind,
      id: `keyword:${keyword.kind}:${keyword.text}`,
      label: keyword.text,
      source: 'llm',
      keywordKind: keyword.kind
    }
  }));
}

function collectCandidates(text: string, definitions: TermDefinition[]): Candidate[] {
  const candidates: Candidate[] = [];
  definitions.forEach((definition) => {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(definition.text, from);
      if (start < 0) break;
      candidates.push({ ...definition, start, end: start + definition.text.length });
      from = start + Math.max(1, definition.text.length);
    }
  });
  return candidates;
}

function overlaps(left: Candidate, right: Candidate): boolean {
  return left.start < right.end && right.start < left.end;
}

export function markNarrativeText(
  text: string,
  state: GameState,
  keywords?: NarrativeKeywordHint[],
  includeLlmKeywords = true
): NarrativeTextSegment[] {
  if (!text) return [{ text: '' }];
  const definitions = deterministicTerms(state);
  if (includeLlmKeywords) definitions.push(...llmTerms(text, keywords));

  const selected: Candidate[] = [];
  const ranked = collectCandidates(text, definitions).sort((left, right) =>
    right.priority - left.priority
    || (right.end - right.start) - (left.end - left.start)
    || left.start - right.start
    || left.target.id.localeCompare(right.target.id)
  );
  for (const candidate of ranked) {
    if (!selected.some((current) => overlaps(current, candidate))) selected.push(candidate);
  }
  selected.sort((left, right) => left.start - right.start);

  const segments: NarrativeTextSegment[] = [];
  let cursor = 0;
  for (const match of selected) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({ text: text.slice(match.start, match.end), mark: match.target });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length ? segments : [{ text }];
}

export function sentenceContaining(text: string, phrase: string): string {
  const index = text.indexOf(phrase);
  if (index < 0) return text;
  const stops = /[。！？!?\n]/;
  let start = index;
  let end = index + phrase.length;
  while (start > 0 && !stops.test(text[start - 1])) start -= 1;
  while (end < text.length && !stops.test(text[end])) end += 1;
  if (end < text.length) end += 1;
  return text.slice(start, end).trim();
}
