import { describe, expect, it } from 'vitest';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import {
  buildRequiredCheck,
  inferDiscoveredItems,
  inferNarrativeConsequences,
  inferSceneChangeFromActions,
  inferStoryEventFromActions,
  sanitizePlayerChoices,
  validateNarratorSemantics
} from '../../src/dm/turnGuards';
import { makeInvestigator, makeState } from './fixtures';

const kb = getActiveKnowledgeBase();

describe('turnGuards', () => {
  it('requires a real roll for risky investigation and does not recurse on dice results', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' }, { 侦查: 70 })] });
    expect(buildRequiredCheck([{ player: '亨利', action: '仔细搜查书房' }], state)).toEqual(
      expect.objectContaining({ player: '亨利', skill: '侦查', difficulty: '普通' })
    );
    expect(buildRequiredCheck([{
      player: '亨利',
      action: '【检定结果】亨利 的 侦查检定：掷出 42，结果：成功。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([
      { player: '亨利', action: '仔细搜查书房' },
      { player: '艾达', action: '开车前往卡森其药店' },
      { player: '亨利', action: '【检定结果】亨利 的 侦查检定：掷出 42，结果：成功。' }
    ], state)).toBeNull();
  });

  it('does not infer a spatial move while its story prerequisite is locked', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })],
      currentScene: 'S01'
    });
    expect(inferSceneChangeFromActions([
      { player: '亨利', action: '检查手头文件' },
      { player: '艾达', action: '开车前往卡森其药店' }
    ], state, kb)).toBeNull();
  });

  it('does not jump across a non-adjacent scene edge', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(inferSceneChangeFromActions([
      { player: '亨利', action: '直接前往泰晤士港' }
    ], state, kb)).toBeNull();
  });

  it('turns an explicit authored story intent into a Director-reviewed proposal', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(inferStoryEventFromActions([
      { player: '亨利', action: '我检查抽屉里的旧合影照片。' }
    ], state)).toEqual(expect.objectContaining({
      name: 'propose_story_event',
      arguments: expect.objectContaining({ eventId: 'EV_FIND_I02' })
    }));
    expect(inferStoryEventFromActions([
      { player: '亨利', action: '我凭空宣布已经击败深潜者。' }
    ], state)).toBeNull();
  });

  it('records a clearly discovered scenario item but not one after a failed check', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(inferDiscoveredItems(
      '你在桌面上发现一张便签。',
      [{ player: '亨利', action: '查看桌面' }],
      state,
      kb,
      'S01'
    )).toContain('I01');
    expect(inferDiscoveredItems(
      '你仍未发现便签。',
      [{ player: '亨利', action: '【检定结果】结果：失败。' }],
      state,
      kb,
      'S01'
    )).toEqual([]);
    expect(inferDiscoveredItems(
      '你没有取得新的发现。',
      [{ player: '亨利', action: '我要检查便签' }],
      state,
      kb,
      'S01'
    )).toEqual([]);
  });

  it('adds minimal HP and SAN consequences when narration forgot state tools', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })] });
    const response = inferNarrativeConsequences({
      narrative: '亨利被深潜者击中，伤口开始流血。'
    }, [{ player: '亨利', action: '迎战怪物' }], state);
    expect(response.stateUpdate?.hp).toEqual({ 亨利: -1 });
    expect(response.stateUpdate?.san).toEqual({ 亨利: -1 });
  });

  it('removes suggestions that reveal undiscovered item names', () => {
    const result = sanitizePlayerChoices({
      亨利: ['检查白色粉末样品', '询问伊莎贝拉']
    }, new Set(), kb);
    expect(result.亨利).not.toContain('检查白色粉末样品');
    expect(result.亨利).toHaveLength(3);
  });

  it('rejects invented weapons, unsafe medical advice and arrival without state change', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(validateNarratorSemantics({
      narrative: '亨利拔出手枪警戒。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/枪械/);
    expect(validateNarratorSemantics({
      narrative: '艾达建议注射活性炭。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/医疗/);
    expect(validateNarratorSemantics({
      narrative: '你们很快抵达卡森其药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/场景切换/);
    expect(validateNarratorSemantics({
      narrative: '马车已经到达码头区。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/场景切换/);
    expect(validateNarratorSemantics({
      narrative: '酒保让你们沿泰晤士街过铁桥寻找药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的街道/);
    expect(validateNarratorSemantics({
      narrative: '你们抵达卡森其药店。', activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [{ name: 'propose_scene_change', arguments: { targetSceneId: 'S04' } }], state, kb))
      .toMatch(/activeNpc/);
  });

  it('rejects exact invented clocks and highly repetitive narration', () => {
    const state = makeState();
    expect(validateNarratorSemantics({
      narrative: '晚上10点，调查员决定继续行动。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/世界时钟/);

    const repeated = '雨水敲打窗户，亨利检查桌面，艾达站在门边警戒，屋内没有出现新的变化。';
    state.messages = [{ id: 'old', type: 'dm', text: repeated }];
    expect(validateNarratorSemantics({
      narrative: repeated, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/高度重复/);
  });
});
