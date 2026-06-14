/**
 * 旧 StoryData 视图 - 由新知识库的“公开面”投影生成。
 *
 * 此文件存在的唯一目的是兼容旧消费者：
 * - UI 组件（SceneStage / ActionDock / clue 列表）读取 desc / name
 * - 旧 reducer 依赖 storyData.items 等映射查找
 *
 * 注意：这里输出的 desc / notes 不再含 KP 内幕。
 * KP 视角的真相统一通过新的 KnowledgeBase + secrets 解锁机制提供给 v2 Narrator。
 */

import type { NpcDefinition, SceneDefinition, StoryData, StoryItem } from '../types/game';
import { wuzhongxiaoshi } from './scenarios/wuzhongxiaoshi';

const scenes = Object.fromEntries(
  Object.entries(wuzhongxiaoshi.scenes).map(([id, layered]) => [
    id,
    {
      id: layered.public.id,
      name: layered.public.name,
      chapterTitle: layered.public.chapterTitle,
      desc: layered.public.desc,
      image: layered.public.image,
      npcs: [...layered.public.npcs],
      items: [...layered.public.items]
    } satisfies SceneDefinition
  ])
) as StoryData['scenes'];

const npcs = Object.fromEntries(
  Object.entries(wuzhongxiaoshi.npcs).map(([name, layered]) => [
    name,
    {
      role: layered.public.role,
      attitude: layered.public.attitude,
      hp: layered.public.hp,
      portrait: layered.public.portrait,
      // 注意：旧 NpcDefinition.notes 字段保留是为了类型兼容；
      // 此处仅放公开外观，不再放剧情内幕。
      notes: layered.public.appearance
    } satisfies NpcDefinition
  ])
) as StoryData['npcs'];

const items = Object.fromEntries(
  Object.entries(wuzhongxiaoshi.items).map(([id, layered]) => [
    id,
    {
      id: layered.public.id,
      name: layered.public.name,
      scene: layered.public.scene,
      // 旧 StoryItem.desc 同样收敛为公开外观；KP 解读藏在 secrets 里。
      desc: layered.public.appearance
    } satisfies StoryItem
  ])
) as StoryData['items'];

export const storyData: StoryData = {
  title: wuzhongxiaoshi.title,
  era: wuzhongxiaoshi.era,
  scenes,
  npcs,
  items
};

export const sceneList = Object.values(storyData.scenes);
