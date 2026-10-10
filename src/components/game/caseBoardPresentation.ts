import { storyData } from '../../data/storyData';
import type { CaseBoardDisplayNode } from './caseBoardGraph';
import type { GameState } from '../../types/game';

export const CASE_RECORD_LABEL = { npc: '人物', scene: '地点', item: '物证', event: '事件', theory: '推测' } as const;

/** Resolve known investigator identifiers only in the public reading projection. */
export function caseRecordText(text: string, players: GameState['players']): string {
  const names = new Map(players.filter(player => player.id && player.name && player.id !== player.name)
    .map(player => [player.id, player.name]));
  if (!names.size) return text;
  const ids = [...names.keys()].sort((a, b) => b.length - a.length)
    .map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp('(^|[^a-zA-Z0-9_-])(' + ids.join('|') + ')(?=$|[^a-zA-Z0-9_-])', 'g');
  return text.replace(pattern, (_match, prefix: string, id: string) => prefix + names.get(id)!);
}

/** Images come from the public projection of records already visible on the board. */
export function caseRecordImage(node: CaseBoardDisplayNode): string | undefined {
  return node.portrait ?? (node.type === 'scene' ? Object.values(storyData.scenes).find((scene) => scene.id === node.refId)?.image : undefined);
}
