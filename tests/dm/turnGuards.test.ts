import { describe, expect, it } from 'vitest';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { createScenarioProgress } from '../../src/scenario/engine';
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

  it('does not turn explicitly negated violence into a combat check', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' }, { '格斗（拳）': 50 })] });

    expect(buildRequiredCheck([{
      player: '亨利', action: '暂缓攻击，明确选择交涉路线。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([{
      player: '亨利', action: '继续谈判，不发动攻击。'
    }], state)).toEqual(expect.objectContaining({ skill: '说服' }));
  });

  it('lets an authored story event own its structured check', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }, { 聆听: 65 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';

    expect(inferStoryEventFromActions([{
      player: '亨利', action: '专注聆听深潜者的声调，理解它们的诉求。'
    }], state)?.arguments.eventId).toBe('EV_NEGOTIATION_LISTEN');
    expect(buildRequiredCheck([{
      player: '亨利', action: '专注聆听深潜者的声调，理解它们的诉求。'
    }], state)).toBeNull();
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

  it('recognizes natural Chinese movement to an unlocked authored scene', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F05'];

    expect(inferSceneChangeFromActions([
      { player: '亨利', action: '我们去警局看看。' }
    ], state, kb)).toEqual(expect.objectContaining({
      name: 'propose_scene_change',
      arguments: expect.objectContaining({ targetSceneId: 'S02' })
    }));
    expect(inferSceneChangeFromActions([
      { player: '亨利', action: '我们暂不去警局。' }
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

  it('removes suggestions that interact with an NPC role absent from the scene', () => {
    const result = sanitizePlayerChoices({
      亨利: ['问店主埃里克来过没有', '询问伊莎贝拉是否认识蒙特利尔']
    }, new Set(), kb, 'S01');

    expect(result.亨利).not.toContain('问店主埃里克来过没有');
    expect(result.亨利).toContain('询问伊莎贝拉是否认识蒙特利尔');
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
    expect(validateNarratorSemantics({
      narrative: '店主想了想：“埃里克十天前来过。”', activeNpc: null, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未授权 NPC/);
    expect(validateNarratorSemantics({
      narrative: '你们来到一家贸易行，准备询问老板。', activeNpc: null, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明地点/);
    expect(validateNarratorSemantics({
      narrative: '蒙特利尔冷冷地拒绝回答。', activeNpc: '洛夫·蒙特利尔', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/activeNpc/);
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

  it('rejects invented addresses, numbered warehouses, items, and affiliations', () => {
    const state = makeState({ currentScene: 'S01' });

    expect(validateNarratorSemantics({
      narrative: '便签把你们引向雾鸦巷17号。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的地址/);
    expect(validateNarratorSemantics({
      narrative: '线索写着贝尔街47号，B仓。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的地址|仓库编号/);
    expect(validateNarratorSemantics({
      narrative: '你从夹层里取得了3B钥匙。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的物品/);
    expect(validateNarratorSemantics({
      narrative: '蒙特利尔其实是码头帮的人物。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的组织身份/);
    expect(validateNarratorSemantics({
      narrative: '可靠线索指向贝尔街14号卡森其药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects premature rescue and departure claims unless an available event authorizes them', () => {
    const opening = makeState({ currentScene: 'S01' });
    expect(validateNarratorSemantics({
      narrative: '埃里克已经获救，扶桑花号也驶离泊位。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);

    const finale = makeState({ currentScene: 'S05' });
    finale.scenarioProgress = createScenarioProgress();
    finale.scenarioProgress.beatStates.B01 = 'completed';
    finale.scenarioProgress.beatStates.B02 = 'completed';
    finale.scenarioProgress.beatStates.B05 = 'completed';
    finale.scenarioProgress.beatStates.B06 = 'active';
    finale.scenarioProgress.lastCheckOutcomes.CHECK_PERSUADE = 'success';
    finale.scenarioProgress.endingId = 'END_C';

    expect(validateNarratorSemantics({
      narrative: '说服奏效，深潜者释放埃里克并同意和平离港。', nextPrompt: '', playerChoices: {}
    }, [], finale, kb))
      .toBeNull();
  });

  it('accepts an authored address when event narration uses different surrounding words', () => {
    const state = makeState({ currentScene: 'S03' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B04 = 'active';
    state.scenarioProgress.variables.oldHethLead = true;

    expect(validateNarratorSemantics({
      narrative: '酒保压低声音：“老鼠在贝尔街14号活动，那里有一间废弃药店。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '还要追问细节吗？',
      playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_BARTENDER_RAT' } }], state, kb))
      .toBeNull();
  });

  it('requires a discovery event to communicate its clue and named people', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';

    const eventCall = [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I02' } }] as const;
    expect(validateNarratorSemantics({
      narrative: '墨水泼在文件上，你们没能看清任何有用内容。',
      nextPrompt: '继续搜查吗？',
      playerChoices: {}
    }, [...eventCall], state, kb)).toMatch(/发现事件.*合影照片/);

    expect(validateNarratorSemantics({
      narrative: '即使墨水污染了文件，你们仍找到一张旧合影，照片上的埃里克正与蒙特利尔并肩站着。',
      nextPrompt: '要核对照片背景吗？',
      playerChoices: {}
    }, [...eventCall], state, kb)).toBeNull();
  });

  it('allows an authored NPC role to speak in its declared scene', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });

    expect(validateNarratorSemantics({
      narrative: '酒保想了想：“我听说老鼠最近在贝尔街活动。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '还要继续追问吗？',
      playerChoices: {}
    }, [], state, kb)).toBeNull();
  });
});
