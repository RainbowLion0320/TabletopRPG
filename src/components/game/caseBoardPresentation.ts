import { storyData } from '../../data/storyData';
import type { CaseBoardDisplayNode } from './caseBoardGraph';

export const CASE_RECORD_LABEL = { npc: '人物', scene: '地点', item: '物证', event: '事件', theory: '推测' } as const;

/** Images come from the public projection of records already visible on the board. */
export function caseRecordImage(node: CaseBoardDisplayNode): string | undefined {
  return node.portrait ?? (node.type === 'scene' ? Object.values(storyData.scenes).find((scene) => scene.id === node.refId)?.image : undefined);
}
