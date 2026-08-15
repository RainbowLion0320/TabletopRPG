import { describe, expect, it } from 'vitest';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { createScenarioProgress } from '../../src/scenario/engine';
import {
  buildRequiredCheck,
  buildPostMoveContinuationActions,
  inferDiscoveredItems,
  inferNarrativeConsequences,
  inferSceneChangeFromActions,
  inferStoryEventActor,
  inferStoryEventFromActions,
  inferStoryEventsFromActions,
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

  it('assigns a lock-picking check to the declared operator instead of a supporting investigator', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '艾达' }, { 机械维修: 45 }),
        makeInvestigator({ name: '罗伯特' }, { 机械维修: 10 })
      ]
    });

    expect(buildRequiredCheck([
      { player: '罗伯特', action: '守在艾达身侧，在她撬锁时提供照明并警戒。' },
      { player: '艾达', action: '用随身工具谨慎撬开药店门锁。' }
    ], state)).toEqual(expect.objectContaining({
      player: '艾达',
      skill: '机械维修'
    }));
  });

  it('does not gate ordinary movement or information-only wording with an investigation roll', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 侦查: 75 }),
        makeInvestigator({ name: '艾达' }, { 侦查: 50 })
      ],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];

    expect(buildRequiredCheck([
      { player: '亨利', action: '按照地图笔记离开药店，立即前往泰晤士港扶桑花号。' },
      { player: '艾达', action: '一起抵达港口并登上扶桑花号，寻找被困的埃里克。' }
    ], state)).toBeNull();
    expect(buildRequiredCheck([
      { player: '亨利', action: '询问伊莎贝拉警方调查进展。' }
    ], state)).toBeNull();
    expect(buildRequiredCheck([
      { player: '亨利', action: '去酒吧寻找酒保并礼貌点两杯酒。' }
    ], state)).toBeNull();
  });

  it('does not treat a request for permission to inspect as an inspection attempt', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 侦查: 50 })]
    });

    expect(buildRequiredCheck([{
      player: '艾达',
      action: '询问埃里克近期是否与蒙特利尔有关，可否查看他的书房、照片和私人物品。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([{
      player: '艾达',
      action: '得到允许后立即查看书房桌面并搜查抽屉。'
    }], state)).toEqual(expect.objectContaining({ player: '艾达', skill: '侦查' }));
  });

  it('does not treat questions about past violence as a combat action', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }, { '格斗（拳）': 50 })],
      currentScene: 'S03'
    });

    expect(buildRequiredCheck([{
      player: '亨利',
      action: '请酒保说明埃里克是否曾被老鼠殴打，以及他有没有受伤。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([{
      player: '亨利',
      action: '亨利挥拳攻击并试图制服眼前的暴徒。'
    }], state)).toEqual(expect.objectContaining({ skill: '格斗（拳）' }));
  });

  it('does not treat carrying or declining a first-aid kit as a First Aid action', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 急救: 80, 侦查: 50 })],
      currentScene: 'S04'
    });

    expect(buildRequiredCheck([{
      player: '艾达',
      action: '携带急救包但不擅自使用；观察气味、门窗和可能需要医疗帮助的人。'
    }], state)).toEqual(expect.objectContaining({ player: '艾达', skill: '侦查' }));
    expect(buildRequiredCheck([{
      player: '艾达',
      action: '本轮不使用急救，只为同伴携带急救包并保持警戒。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([{
      player: '艾达',
      action: '打开急救包为亨利包扎止血。'
    }], state)).toEqual(expect.objectContaining({ player: '艾达', skill: '急救' }));
  });

  it('does not turn a companion\'s conditional first-aid preparation into the current check', () => {
    const actions = [
      {
        player: '亨利·格雷',
        action: '退到栈桥掩体后拔出手枪，瞄准最前方阻拦的深潜者开枪，阻止扶桑花号离港并营救埃里克。'
      },
      {
        player: '艾达·华莱士',
        action: '伏低身体寻找掩护，观察埃里克的位置并准备在亨利受伤时实施急救，不另行攻击。'
      }
    ];
    const unarmed = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷', equipment: [] }, { '射击（手枪）': 20 }),
        makeInvestigator({ name: '艾达·华莱士', equipment: [] }, { 急救: 80 })
      ],
      currentScene: 'S05'
    });
    unarmed.scenarioProgress = createScenarioProgress();
    unarmed.scenarioProgress.beatStates.B01 = 'completed';
    unarmed.scenarioProgress.beatStates.B02 = 'completed';
    unarmed.scenarioProgress.beatStates.B05 = 'completed';
    unarmed.scenarioProgress.beatStates.B06 = 'active';

    expect(inferStoryEventFromActions(actions, unarmed)).toBeNull();
    expect(buildRequiredCheck(actions, unarmed)).toEqual(expect.objectContaining({
      player: '艾达·华莱士', skill: '侦查'
    }));
    expect(buildRequiredCheck([{
      player: '艾达·华莱士',
      action: '只准备在亨利受伤时实施急救，本轮不实际救治。'
    }], unarmed)).toBeNull();

    const armed = {
      ...unarmed,
      players: [
        makeInvestigator({ name: '亨利·格雷', equipment: ['.32左轮手枪'] }, { '射击（手枪）': 20 }),
        unarmed.players[1]
      ]
    };
    expect(inferStoryEventFromActions(actions, armed)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_CHOOSE_COMBAT' })
    }));
    expect(inferStoryEventActor(actions, armed, 'EV_CHOOSE_COMBAT')).toBe('亨利·格雷');
    expect(buildRequiredCheck(actions, armed)).toBeNull();
  });

  it('keeps an explicit finale route choice ahead of a companion observation', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }, { 侦查: 75 }),
        makeInvestigator({ name: '罗伯特·肖', equipment: ['警用左轮手枪'] }, {
          侦查: 50,
          '射击（手枪）': 60
        })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    const actions = [
      { player: '亨利·格雷', action: '观察埃里克、交涉代表和甲板守卫的当前状态' },
      { player: '罗伯特·肖', action: '选择以武力阻止深潜者带走埃里克' }
    ];

    expect(inferStoryEventsFromActions(actions, state)).toEqual([
      expect.objectContaining({
        arguments: expect.objectContaining({ eventId: 'EV_CHOOSE_COMBAT' })
      })
    ]);
    expect(inferStoryEventActor(actions, state, 'EV_CHOOSE_COMBAT')).toBe('罗伯特·肖');
    expect(buildRequiredCheck(actions, state)).toBeNull();
  });

  it('does not make legal travel depend on a risky follow-up observation', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 心理学: 10 }),
        makeInvestigator({ name: '艾达' }, { 心理学: 65 })
      ],
      currentScene: 'S02'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.oldHethLead = true;

    const actions = [
      { player: '亨利', action: '暂时收手，离开分局，改从老赫特酒吧寻找突破口' },
      { player: '艾达', action: '与亨利一同离开分局前往老赫特酒吧；进门后先观察酒保和常客对埃里克照片的反应，不惊动其他人。' }
    ];

    expect(inferSceneChangeFromActions(actions, state, kb)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ targetSceneId: 'S03' })
    }));
    expect(buildRequiredCheck(actions, state)).toEqual(expect.objectContaining({
      player: '艾达',
      skill: '心理学',
      difficulty: '普通'
    }));
    expect(buildPostMoveContinuationActions(actions, state, 'S03', kb)).toEqual([
      { player: '亨利', action: '寻找突破口' },
      { player: '艾达', action: '进门后先观察酒保和常客对埃里克照片的反应，不惊动其他人。' }
    ]);
  });

  it('uses the authored hard Psychology difficulty against Montreal', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 心理学: 65 })],
      currentScene: 'S02'
    });

    expect(buildRequiredCheck([{
      player: '艾达',
      action: '观察蒙特利尔的表情、停顿和肢体反应，判断他是否说谎。'
    }], state)).toEqual(expect.objectContaining({ skill: '心理学', difficulty: '困难' }));
  });

  it('does not let the Montreal meeting event swallow a companion Psychology check', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 心理学: 45 }),
        makeInvestigator({ name: '罗伯特' }, { 心理学: 45 })
      ],
      currentScene: 'S02'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B03 = 'active';
    state.scenarioProgress.objectiveStates.O03 = 'active';
    const actions = [
      { player: '亨利', action: '出示合影，请蒙特利尔确认是否认识埃里克，并说明警方为何没有进展。' },
      { player: '罗伯特', action: '只观察蒙特利尔看到合影时的即时表情与手部动作。' }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_MEET_MONTREAL');
    expect(buildRequiredCheck(actions, state)).toEqual(expect.objectContaining({
      player: '罗伯特', skill: '心理学', difficulty: '困难'
    }));
  });

  it('settles the Montreal meeting through natural questioning, rolled observation, or explicit closure', () => {
    const state = makeState({ currentScene: 'S02' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B03 = 'active';
    state.scenarioProgress.objectiveStates.O03 = 'active';

    expect(inferStoryEventFromActions([{
      player: '艾达',
      action: '向值班警员出示合影，请求面见蒙特利尔局长。'
    }], state)).toBeNull();
    expect(inferStoryEventFromActions([{
      player: '艾达',
      action: '把合影递给蒙特利尔，请他说明与埃里克何时认识、最近一次见面在哪里。'
    }], state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_MEET_MONTREAL' })
    }));

    const rolledObservation = [
      { player: '罗伯特', action: '观察蒙特利尔看到合影时的眼神、停顿与手部动作。' },
      { player: '罗伯特', action: '【检定结果】罗伯特 的 侦查检定：掷出 65，结果：失败。' }
    ];
    expect(inferStoryEventFromActions(rolledObservation, state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_MEET_MONTREAL' })
    }));
    expect(inferStoryEventFromActions([{
      player: '罗伯特',
      action: '将蒙特利尔的拒绝和离场时间记入笔记，结束会面并离开警察局。'
    }], state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_MEET_MONTREAL' })
    }));
  });

  it('settles the bartender lead when players pay for information or explain the missing-person search', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B04 = 'active';

    expect(inferStoryEventFromActions([
      { player: '亨利', action: '用金钱作为报酬换取更多信息。' },
      { player: '艾达', action: '诚恳说明我们受伊莎贝拉所托寻找失踪的父亲。' }
    ], state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_BARTENDER_RAT' })
    }));
    expect(inferStoryEventFromActions([{
      player: '亨利', action: '只点两杯酒，暂时不打听任何消息。'
    }], state)).toBeNull();
    expect(inferStoryEventFromActions([
      {
        player: '亨利',
        action: '向酒保出示埃里克与蒙特利尔的合影，只请他核对是否见过埃里克、同行者，以及他们最后前往的地点。'
      },
      {
        player: '罗伯特',
        action: '买两杯酒并给一笔合理小费，请酒保只说他能亲自确认的时间、人数、衣着与去向，不要求猜测。'
      }
    ], state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_BARTENDER_RAT' })
    }));
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

  it('keeps a weapon sweep as the combat action and assigns the authored check to its actor', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '艾达' }, { '闪避': 70, '格斗（拳）': 30 }),
        makeInvestigator({ name: '罗伯特' }, { '闪避': 50, '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 1, active: true, visible: true };

    const actions = [
      { player: '艾达', action: '继续用灯光锁定刚才闪避的深潜者，为罗伯特示警，本轮不攻击。' },
      { player: '罗伯特', action: '再次逼近同一名深潜者，避开蹼爪后用警棍横扫他的膝部。' }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_COMBAT_ATTACK');
    expect(buildRequiredCheck(actions, state)).toBeNull();
    expect(inferStoryEventActor(actions, state, 'EV_COMBAT_ATTACK')).toBe('罗伯特');
  });

  it('treats natural weapon strike wording as an authored finale attack', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 3, active: true, visible: true };

    const actions = [{
      player: '罗伯特',
      action: '绕过倒地的敌人，向第三名仍在抵抗的深潜者踏步近身，用警棍击打他的膝部使其失去战斗能力。'
    }];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_COMBAT_ATTACK');
    expect(inferStoryEventActor(actions, state, 'EV_COMBAT_ATTACK')).toBe('罗伯特');
  });

  it('treats a declared weapon counterattack as an authored finale attack', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用警棍'] }, { '格斗（拳）': 70 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };

    const actions = [{
      player: '罗伯特',
      action: '放弃故障的左轮，拔出警用警棍迎击最前方的深潜者，掩护艾达。'
    }];
    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_COMBAT_ATTACK');
    expect(inferStoryEventActor(actions, state, 'EV_COMBAT_ATTACK')).toBe('罗伯特');
  });

  it('does not add a generic search check to a rescue attempt during unresolved combat', () => {
    const state = makeState({ players: [makeInvestigator({ name: '艾达' })], currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';

    expect(buildRequiredCheck([{
      player: '艾达', action: '冲进船舱寻找埃里克，为他检查伤势并带他离船。'
    }], state)).toBeNull();
  });

  it('treats a natural first strike as the authored combat route and keeps its actor', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const actions = [
      { player: '亨利', action: '躲在木箱后观察守卫位置，掩护罗伯特继续攻击，本轮不出手。' },
      { player: '罗伯特', action: '用警棍抢先打倒离埃里克最近的深潜者，阻止扶桑花号离港。' }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_CHOOSE_COMBAT');
    expect(inferStoryEventActor(actions, state, 'EV_CHOOSE_COMBAT')).toBe('罗伯特');
    expect(buildRequiredCheck(actions, state)).toBeNull();
  });

  it('does not assign an authored attack to a companion who only names and covers the attacker', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';

    const actions = [
      { player: '亨利', action: '留在木箱后观察三名守卫的位置，掩护罗伯特继续攻击，不切换交涉路线。' },
      { player: '罗伯特', action: '挥动警棍攻击第二名仍在抵抗的深潜者，等待格斗检定决定结果。' }
    ];

    expect(inferStoryEventActor(actions, state, 'EV_COMBAT_ATTACK')).toBe('罗伯特');
  });

  it('keeps a melee check on the attacker when a full-name companion only provides gun cover', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特·肖', equipment: ['警用左轮手枪'] }, {
          '格斗（拳）': 70,
          '射击（手枪）': 60
        })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };

    const actions = [
      { player: '亨利·格雷', action: '继续攻击眼前的深潜者。' },
      {
        player: '罗伯特·肖',
        action: '保持在木箱后警戒，用枪口牵制其他深潜者，但这一轮不开火，只为亨利的徒手攻击提供掩护。'
      }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_COMBAT_ATTACK');
    expect(inferStoryEventActor(actions, state, 'EV_COMBAT_ATTACK')).toBe('亨利·格雷');
  });

  it('assigns initial combat to the investigator who opens fire instead of the route caller', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特·肖', equipment: ['警用左轮手枪'] }, {
          '格斗（拳）': 70,
          '射击（手枪）': 60
        })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const actions = [
      {
        player: '亨利·格雷',
        action: '明确选择武力路线阻止深潜者离港；亨利留在掩体后观察埃里克，不在本轮攻击，只为罗伯特提供掩护。'
      },
      {
        player: '罗伯特·肖',
        action: '拔出警用左轮手枪，明确以武力阻止扶桑花号离港，瞄准一名深潜者开火，避免误伤埃里克。'
      }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_CHOOSE_COMBAT');
    expect(inferStoryEventActor(actions, state, 'EV_CHOOSE_COMBAT')).toBe('罗伯特·肖');
  });

  it('does not create a combat event from a support-only reference to another attacker', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特·肖', equipment: ['警用左轮手枪'] }, { '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';

    expect(inferStoryEventFromActions([{
      player: '罗伯特·肖',
      action: '保持在木箱后警戒，用枪口牵制其他深潜者，但这一轮不开火，只为亨利的徒手攻击提供掩护。'
    }], state)).toBeNull();
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

    const directExchange = [{
      player: '亨利', action: '根据手势提出交换条件，说服它先释放埃里克再和平离港。'
    }];
    expect(inferStoryEventFromActions(directExchange, state)?.arguments.eventId)
      .toBe('EV_NEGOTIATION_LISTEN');
    expect(buildRequiredCheck(directExchange, state)).toBeNull();
  });

  it('maps natural finale listening to the authored actor and ignores explicitly negated persuasion', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 聆听: 65, 说服: 60 }),
        makeInvestigator({ name: '艾达' }, { 聆听: 65, 说服: 60 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    const actions = [
      {
        player: '亨利',
        action: '放下武器，与扶桑花号交涉代表保持距离，专心倾听并准确复述它关于埃里克和交易的诉求。'
      },
      {
        player: '艾达',
        action: '协助亨利维持安静的交涉空间，观察代表语气与停顿，确保不误解它的诉求，不另行发起攻击或说服。'
      }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId)
      .toBe('EV_NEGOTIATION_LISTEN');
    expect(inferStoryEventActor(actions, state, 'EV_NEGOTIATION_LISTEN')).toBe('亨利');
    expect(buildRequiredCheck(actions, state)).toBeNull();
  });

  it('lets a direct authored clue-analysis event bypass generic investigation checks', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S01'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    state.scenarioProgress.clueStates.I04 = 'discovered';
    state.clues = [{ id: 'I04', name: '小册子', description: '', discoveredAt: 1 }];
    const actions = [{
      player: '托马斯', action: '检查小册子夹页并谨慎加热，使隐写显字。'
    }];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_FIND_I04');
    expect(buildRequiredCheck(actions, state)).toBeNull();

    state.currentScene = 'S03';
    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_FIND_I04');
    expect(buildRequiredCheck(actions, state)).toBeNull();

    const naturalReview = [{
      player: '托马斯',
      action: '把小册子重新置于稳定灯光下，只复核受热隐写中能够明确辨认的完整地址。'
    }];
    expect(inferStoryEventFromActions(naturalReview, state)?.arguments.eventId).toBe('EV_FIND_I04');
    expect(buildRequiredCheck(naturalReview, state)).toBeNull();
  });

  it('requires a real roll before the pharmacy map event and uses its authored fail-forward', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';
    const search = [{ player: '托马斯', action: '搜查后厅油布包，寻找并检查潮湿的地图笔记。' }];

    expect(buildRequiredCheck(search, state)).toEqual(expect.objectContaining({
      player: '托马斯', skill: '侦查', difficulty: '普通'
    }));
    expect(inferStoryEventsFromActions(search, state, kb)).toEqual([
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_S04_MAP' }) })
    ]);

    const failed = [...search, {
      player: '托马斯',
      action: '【检定结果】托马斯 的 侦查检定：掷出 92，结果：失败。'
    }];
    expect(buildRequiredCheck(failed, state)).toBeNull();
    expect(inferStoryEventsFromActions(failed, state, kb)).toEqual([
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_FAIL_I07' }) })
    ]);
  });

  it('uses the authored clue check when natural wording names search areas without a generic search verb', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 急救: 55, 侦查: 55 }),
        makeInvestigator({ name: '艾达' }, { 急救: 80, 侦查: 50 })
      ],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';
    const actions = [
      { player: '亨利', action: '为艾达照明并警戒；本轮不搜索、不使用急救，只保护同伴。' },
      { player: '艾达', action: '沿后厅柜台、油布包和散落纸张进行侦查，寻找埃里克姓名、船名或具体泊位地图。' }
    ];

    expect(buildRequiredCheck(actions, state)).toEqual(expect.objectContaining({
      player: '艾达', skill: '侦查', difficulty: '普通'
    }));
    expect(inferStoryEventsFromActions(actions, state, kb)).toEqual([
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_S04_MAP' }) }),
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_S04_CIGAR' }) })
    ]);
  });

  it('treats the natural back-room synonym as the authored pharmacy map area', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';
    const actions = [{
      player: '托马斯',
      action: '仔细搜查柜台、抽屉和后室，寻找账本、货单或标有港口去向的文件。'
    }];

    expect(buildRequiredCheck(actions, state)).toEqual(expect.objectContaining({
      player: '托马斯', skill: '侦查', difficulty: '普通'
    }));
    expect(inferStoryEventsFromActions(actions, state, kb)).toEqual([
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_S04_MAP' }) }),
      expect.objectContaining({ arguments: expect.objectContaining({ eventId: 'EV_S04_CIGAR' }) })
    ]);
  });

  it('does not add a roll for an authored automatic clue', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }, { 侦查: 70 })],
      currentScene: 'S01'
    });

    expect(buildRequiredCheck([{
      player: '亨利', action: '检查文件堆和桌角，寻找公开摆放的资料。'
    }], state)).toBeNull();
  });

  it('rejects an invented berth number appended to the authored pharmacy map result', () => {
    const state = makeState({ currentScene: 'S04' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';

    expect(validateNarratorSemantics({
      narrative: '托马斯展开潮湿的手绘地图，看见泰晤士港的偏僻泊位和扶桑花号标记。罗伯特护住纸张边缘，托马斯将路线和泊位编号逐字记录。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {}
    }, [{
      name: 'propose_story_event',
      arguments: { eventId: 'EV_S04_MAP', reason: '玩家明确搜查地图' }
    }], state, kb)).toContain('线索中的路线或设施细节');
  });

  it('settles a natural finale route choice before any follow-up generic check', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 聆听: 65 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const actions = [{
      player: '艾达',
      action: '不使用武力，愿意与深潜者交涉，并专心聆听它的诉求。'
    }];
    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_CHOOSE_NEGOTIATION');
    expect(buildRequiredCheck(actions, state)).toBeNull();
  });

  it('treats lowering weapons to listen as a negotiation route choice', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 聆听: 65 }),
        makeInvestigator({ name: '艾达' }, { 聆听: 65 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const actions = [
      {
        player: '亨利',
        action: '放下武器，与扶桑花号交涉代表保持距离，专心倾听并准确复述它关于埃里克和交易的诉求。'
      },
      {
        player: '艾达',
        action: '协助亨利维持安静的交涉空间，观察代表语气与停顿，确保不误解它的诉求，不另行发起攻击或说服。'
      }
    ];

    expect(inferStoryEventFromActions(actions, state)?.arguments.eventId).toBe('EV_CHOOSE_NEGOTIATION');
    expect(buildRequiredCheck(actions, state)).toBeNull();
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

  it('recognizes the real generated 转向 wording when leaving the police station', () => {
    const state = makeState({ currentScene: 'S02' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.oldHethLead = true;

    expect(inferSceneChangeFromActions([
      { player: '托马斯·贝尔', action: '先离开警局，转向老赫特酒吧调查' },
      { player: '罗伯特·肖', action: '先离开警局，转向老赫特酒吧调查' }
    ], state, kb)).toEqual(expect.objectContaining({
      name: 'propose_scene_change',
      arguments: expect.objectContaining({ targetSceneId: 'S03' })
    }));
  });

  it('does not treat 去向 in a clue search as movement after the destination unlocks', () => {
    const state = makeState({ currentScene: 'S04' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];

    expect(inferSceneChangeFromActions([{
      player: '亨利',
      action: '搜查后厅被翻动的区域和油布包，只寻找能确认埃里克去向与港口位置的物证。'
    }], state, kb)).toBeNull();
  });

  it('does not treat an unlocked scene mentioned as a habitual destination as immediate travel', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.oldHethLead = true;

    expect(inferSceneChangeFromActions([{
      player: '罗伯特',
      action: '询问伊莎贝拉埃里克常去的酒吧、书房和可供搜查的个人物品。'
    }], state, kb)).toBeNull();
  });

  it('recognizes the written-out street address as the authored pharmacy', () => {
    const state = makeState({ currentScene: 'S03' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    expect(inferSceneChangeFromActions([
      { player: '亨利', action: '前往贝尔街十四号一探究竟。' }
    ], state, kb)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ targetSceneId: 'S04' })
    }));
  });

  it('recognizes a destination named before a conditional entry verb', () => {
    const state = makeState({ currentScene: 'S03' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    expect(inferSceneChangeFromActions([{
      player: '艾达',
      action: '核对门牌，若确认是卡森其药店便从后门谨慎进入。'
    }], state, kb)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ targetSceneId: 'S04' })
    }));
  });

  it('does not let a negated optional destination override the declared destination', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F05'];
    state.scenarioProgress.variables.oldHethLead = true;

    expect(inferSceneChangeFromActions([
      {
        player: '亨利',
        action: '依据伊莎贝拉提供的生活线索，带上埃里克照片离开住宅，直接前往老赫特酒吧询问他最后出现的情况，暂不去警局。'
      },
      {
        player: '托马斯',
        action: '与亨利同行去老赫特酒吧，在途中整理埃里克照片和伊莎贝拉证词，准备以记者身份礼貌询问酒保。'
      }
    ], state, kb)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ targetSceneId: 'S03' })
    }));
  });

  it('does not move when players only prepare to visit an unlocked destination', () => {
    const state = makeState({ currentScene: 'S03' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    expect(inferSceneChangeFromActions([{
      player: '艾达',
      action: '不再追问未经证实的伤情，只根据已确认的贝尔街14号线索与亨利准备前往药店。'
    }], state, kb)).toBeNull();
  });

  it('does not move when players explicitly stay and only discuss a later return', () => {
    const state = makeState({ currentScene: 'S04' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08', 'F09'];

    expect(inferSceneChangeFromActions([
      {
        player: '亨利',
        action: '留在卡森其药店检查地图上的港口标记，只讨论以后是否返回酒吧，本轮不动身。'
      },
      {
        player: '艾达',
        action: '同意留在卡森其药店，继续核对地图与当前药店环境，不前往任何其他地点。'
      }
    ], state, kb)).toBeNull();
  });

  it('does not reverse a move by treating the source scene after 离开 as its destination', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];

    expect(inferSceneChangeFromActions([
      {
        player: '亨利',
        action: '放下烟蒂，立即离开卡森其药店前往泰晤士港扶桑花号。'
      }
    ], state, kb)).toBeNull();
  });

  it('does not execute movement that a player only discusses for later', () => {
    const state = makeState({ currentScene: 'S04' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];

    expect(inferSceneChangeFromActions([{
      player: '艾达', action: '收好地图，然后提醒亨利尽快赶往泰晤士港。'
    }], state, kb)).toBeNull();
  });

  it('turns explicit authored clue searches into Director-reviewed proposals', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(inferStoryEventsFromActions([
      { player: '亨利', action: '我检查抽屉里的旧合影照片。' }
    ], state)).toEqual([expect.objectContaining({
      name: 'propose_story_event',
      arguments: expect.objectContaining({ eventId: 'EV_FIND_I02' })
    })]);
    expect(inferStoryEventFromActions([
      { player: '亨利', action: '我凭空宣布已经击败深潜者。' }
    ], state)).toBeNull();
  });

  it('maps natural search areas to authored clue events without requiring spoiler names', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    const actions = [
      { player: '亨利', action: '系统搜查书房桌面、抽屉和书架夹缝，只记录实际发现。' },
      { player: '托马斯', action: '协助检查同一书房的桌面、抽屉和书架。' }
    ];

    expect(inferStoryEventsFromActions(actions, state).map((call) => call.arguments.eventId)).toEqual([
      'EV_FIND_I01',
      'EV_FIND_I02',
      'EV_DISCOVER_I04'
    ]);
    expect(inferStoryEventsFromActions([...actions, {
      player: '亨利',
      action: '【检定结果】亨利的侦查检定：掷出84，结果：失败。'
    }], state).map((call) => call.arguments.eventId)).toEqual([
      'EV_FAIL_I01',
      'EV_FAIL_I02',
      'EV_FAIL_I04'
    ]);
  });

  it('does not authorize clue searches from a separate negated clause', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    const actions = [
      {
        player: '亨利',
        action: '检查埃里克书桌抽屉和相框背面，寻找并辨认与蒙特利尔有关的合影照片，不同时翻查其他区域。'
      },
      {
        player: '艾达',
        action: '协助亨利记录并辨认同一张合影照片上的人物，不另行搜索书架或垃圾桶。'
      }
    ];

    expect(inferStoryEventsFromActions(actions, state).map((call) => call.arguments.eventId))
      .toEqual(['EV_FIND_I02']);
  });

  it('does not treat a desk compartment as the garage powder compartment', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    const actions = [
      {
        player: '托马斯·贝尔',
        action: '系统搜查书架夹页、书本缝隙和书桌暗格，寻找小册子、夹页或藏匿文件。'
      },
      {
        player: '罗伯特·肖',
        action: '为托马斯照明并警戒，记录他在同一处书架找到的物品，本轮不另行搜查。'
      }
    ];

    expect(inferStoryEventsFromActions(actions, state).map((call) => call.arguments.eventId))
      .toEqual(['EV_DISCOVER_I04']);

    expect(inferStoryEventsFromActions([{
      player: '艾达·华莱士',
      action: '去车库检查里面的暗格，辨认其中样品。'
    }], state).map((call) => call.arguments.eventId)).toEqual(['EV_FIND_I05']);
  });

  it('settles every explicitly searched clue through its authored failure path', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';

    const calls = inferStoryEventsFromActions([
      { player: '亨利', action: '检查桌上便签、抽屉里的旧合影和书架夹缝的小册子。' },
      { player: '艾达', action: '检查名片和垃圾桶里的报纸残片。' },
      { player: '亨利', action: '【检定结果】亨利 的侦查检定：掷出 82，结果：失败。' }
    ], state);

    expect(calls.map((call) => call.arguments.eventId)).toEqual([
      'EV_FAIL_I01',
      'EV_FAIL_I02',
      'EV_FIND_I03',
      'EV_FAIL_I04',
      'EV_FAIL_I06'
    ]);
  });

  it('discovers but does not analyze the booklet until a separate decoding action', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';

    expect(inferStoryEventsFromActions([
      { player: '亨利', action: '检查书架夹缝里的小册子。' }
    ], state).map((call) => call.arguments.eventId)).toEqual(['EV_DISCOVER_I04']);

    state.clues = [{ id: 'I04', name: '小册子', description: '', discoveredAt: 1 }];
    state.scenarioProgress.clueStates.I04 = 'discovered';
    expect(inferStoryEventFromActions([
      { player: '艾达', action: '小心加热小册子夹页，让隐写显字。' }
    ], state)?.arguments.eventId).toBe('EV_FIND_I04');
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
    expect(inferDiscoveredItems(
      '尽管亨利没能判断便签上笔触是否异常，他仍看清了桌面上那张写有“别来找我”的字条。',
      [],
      state,
      kb,
      'S01'
    )).toContain('I01');
  });

  it('requires a Director-approved event for the exact failed-roll clue wording seen in play', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    const output = {
      narrative: '尽管亨利没能判断便签上笔触是否异常，他仍看清了桌面上那张写有“别来找我”的字条。',
      activeNpc: '伊莎贝拉·摩勒',
      nextPrompt: '下一步怎么做？',
      playerChoices: {}
    };
    const actions = [{
      player: '亨利',
      action: '【检定结果】亨利的侦查检定：掷出84，结果：失败。'
    }];

    expect(validateNarratorSemantics(output, [], state, kb, actions)).toMatch(/便签 -> EV_FAIL_I01/);
    expect(validateNarratorSemantics(output, [{
      name: 'propose_story_event',
      arguments: { eventId: 'EV_FAIL_I01' }
    }], state, kb, actions)).toBeNull();
  });

  it('infers minimal physical harm but never invents SAN loss from creature names', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })] });
    const response = inferNarrativeConsequences({
      narrative: '亨利被深潜者击中，伤口开始流血。'
    }, [{ player: '亨利', action: '迎战怪物' }], state);
    expect(response.stateUpdate?.hp).toEqual({ 亨利: -1 });
    expect(response.stateUpdate?.san).toBeUndefined();
  });

  it('assigns narrated harm only to the investigator named as injured', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }), makeInvestigator({ name: '罗伯特' })]
    });
    const response = inferNarrativeConsequences({
      narrative: '艾达的指尖被锈迹划出一道细痕，罗伯特仍在一旁照明。'
    }, [
      { player: '艾达', action: '尝试撬锁' },
      { player: '罗伯特', action: '提供照明' }
    ], state);

    expect(response.stateUpdate?.hp).toEqual({ 艾达: -1 });
  });

  it('does not assign enemy injuries to the investigator who made the roll', () => {
    const state = makeState({ players: [makeInvestigator({ name: '罗伯特' })] });
    const response = inferNarrativeConsequences({
      narrative: '罗伯特的警棍命中深潜者膝部。灰绿色鳞片下传来闷响，那受伤的身影踉跄后退。'
    }, [{
      player: '罗伯特',
      action: '【检定结果】罗伯特 的 格斗（拳）检定：掷出 40，结果：普通成功。'
    }], state);

    expect(response.stateUpdate?.hp).toEqual({});
  });

  it('recognizes a named investigator struck before a wound is described', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }), makeInvestigator({ name: '罗伯特' })]
    });
    const response = inferNarrativeConsequences({
      narrative: '那名深潜者趁机反手一击，锋利的指甲划过罗伯特的前臂，撕开一道血口。'
    }, [
      { player: '艾达', action: '举灯示警' },
      { player: '罗伯特', action: '攻击深潜者' }
    ], state);

    expect(response.stateUpdate?.hp).toEqual({ 罗伯特: -1 });
  });

  it('recognizes a bleeding wound on an investigator small arm', () => {
    const state = makeState({ players: [makeInvestigator({ name: '罗伯特' })] });
    const response = inferNarrativeConsequences({
      narrative: '那名深潜者反手一挥，尖锐的指甲划过罗伯特的小臂，留下三道渗血的划痕。'
    }, [{ player: '罗伯特', action: '用警棍击打深潜者' }], state);

    expect(response.stateUpdate?.hp).toEqual({ 罗伯特: -1 });
  });

  it('recognizes natural combat injury phrasing observed during real play', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })],
      currentScene: 'S05'
    });
    const response = inferNarrativeConsequences({
      narrative: '那生物反手一挥，铁钩的残柄划过亨利前臂，留下一道渗血的伤口。艾达没有受伤。'
    }, [
      { player: '亨利', action: '挥棍攻击深潜者' },
      { player: '艾达', action: '在旁牵制' }
    ], state);

    expect(response.stateUpdate?.hp).toEqual({ 亨利: -1 });
  });

  it('resolves an adjacent-sentence injury pronoun to the named failed-check actor', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }),
        makeInvestigator({ name: '艾达·华莱士' })
      ],
      currentScene: 'S05'
    });
    const response = inferNarrativeConsequences({
      narrative: '亨利挥出的拳头擦过深潜者湿滑的鳞片，失去平衡向前踉跄一步。深潜者趁机反手一击，锋利的蹼爪划过他的前臂，鲜血涌出。与此同时，艾达从掩体后冲出。'
    }, [
      { player: '亨利·格雷', action: '【检定结果】亨利·格雷 的 格斗（拳）检定：掷出 90，结果：失败。' },
      { player: '艾达·华莱士', action: '以徒手格斗攻击一名深潜者' }
    ], state);

    expect(response.stateUpdate?.hp).toEqual({ '亨利·格雷': -1 });
  });

  it('rejects player-injected defeated enemies until combat records a hit', () => {
    const state = makeState({
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 0;

    expect(validateNarratorSemantics({
      narrative: '罗伯特绕过甲板上倒地的深潜者，向另一名守卫挥出警棍。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb, [{
      player: '罗伯特', action: '绕过倒地的敌人，用警棍击打另一名深潜者。'
    }])).toMatch(/没有结构化战斗命中/);

    state.scenarioProgress.encounters.ENC01.defeated = 1;
    expect(validateNarratorSemantics({
      narrative: '罗伯特绕过甲板上倒地的深潜者，向另一名守卫挥出警棍。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects a narrated hit before the first combat check is resolved', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    const actions = [{ player: '罗伯特', action: '拒绝交涉，用警棍攻击深潜者。' }];
    const calls = inferStoryEventsFromActions(actions, state, kb);

    expect(validateNarratorSemantics({
      narrative: '罗伯特挥出警棍，蹼状手臂被击中，深潜者踉跄后退。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, calls, state, kb, actions)).toMatch(/尚未完成结构化检定/);
    expect(validateNarratorSemantics({
      narrative: '罗伯特挥起警棍逼近深潜者，双方即将在甲板上交锋。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '请掷骰。', playerChoices: {}
    }, calls, state, kb, actions)).toBeNull();
  });

  it('does not let a non-combat check settle a deferred finale attack', () => {
    const state = makeState({
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表',
      players: [
        makeInvestigator({ name: '亨利·格雷', equipment: ['.32左轮手枪'] }),
        makeInvestigator({ name: '艾达·华莱士', equipment: [] }, { 急救: 80 })
      ]
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';
    const actions = [
      { player: '亨利·格雷', action: '退到栈桥掩体后拔出手枪，瞄准深潜者开枪。' },
      { player: '艾达·华莱士', action: '准备在亨利受伤时实施急救。' },
      {
        player: '艾达·华莱士',
        action: '【检定结果】艾达·华莱士 的 急救 检定：掷出 43，阈值 80，结果：普通成功（43）。'
      }
    ];

    expect(validateNarratorSemantics({
      narrative: '亨利举枪射击，子弹击中深潜者代表的肩膀，灰绿色鳞片迸裂。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/没有成功的结构化战斗检定/);
  });

  it('rejects finale reinforcements before a route is chosen', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';

    expect(validateNarratorSemantics({
      narrative: '更多的灰绿色身影从船舱涌出，堵住栈桥。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得虚构船舱援军/);
  });

  it('does not mistake an investigator named as the attacker for the victim', () => {
    const state = makeState({ players: [makeInvestigator({ name: '罗伯特' })] });
    const response = inferNarrativeConsequences({
      narrative: '罗伯特的警棍划伤深潜者的前臂，血口让怪物踉跄后退。'
    }, [{ player: '罗伯特', action: '挥动警棍攻击' }], state);

    expect(response.stateUpdate?.hp).toEqual({});
  });

  it('rejects narration that negates a resolved structured combat hit', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 1;
    const actions = [{
      player: '罗伯特',
      action: '【检定结果】罗伯特 的 格斗（拳）检定：掷出 40，结果：普通成功。'
    }];
    const base = {
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '下一步怎么做？',
      playerChoices: {}
    };

    expect(validateNarratorSemantics({
      ...base,
      narrative: '罗伯特命中那名深潜者，但它并未倒下，仍在继续抵抗。'
    }, [], state, kb, actions)).toMatch(/不得否定/);
    expect(validateNarratorSemantics({
      ...base,
      narrative: '罗伯特的子弹击中那名深潜者的肩膀，它发出低沉嘶吼，但仍未倒下。'
    }, [], state, kb, actions)).toMatch(/不得否定/);
    expect(validateNarratorSemantics({
      ...base,
      narrative: '罗伯特命中那名深潜者。它并未倒下，却已无力再战。'
    }, [], state, kb, actions)).toBeNull();
  });

  it('does not resolve a second investigator attack without another roll', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 2;
    const actions = [
      { player: '亨利·格雷', action: '以徒手格斗攻击一名仍在抵抗的深潜者' },
      { player: '罗伯特·肖', action: '使用随身手枪攻击一名仍在抵抗的深潜者' },
      {
        player: '罗伯特·肖',
        action: '【检定结果】罗伯特·肖 的 射击（手枪）检定：掷出 42，结果：普通成功。'
      }
    ];

    expect(validateNarratorSemantics({
      narrative: '罗伯特的攻击使一名深潜者失去战斗能力。亨利趁机冲上前，挥拳猛击另一名深潜者的头部。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '继续战斗。',
      playerChoices: {}
    }, [], state, kb, actions)).toMatch(/其他调查员判定攻击结果/);
  });

  it('rejects combat narration that exceeds the structured defeated count', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 2;

    expect(validateNarratorSemantics({
      narrative: '罗伯特的警棍击中一名守卫，甲板上已有三名深潜者失去战斗能力。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/仅结算2名/);

    state.scenarioProgress.encounters.ENC01.defeated = 3;
    expect(validateNarratorSemantics({
      narrative: '亨利这次攻击落空，但最后一名深潜者也失去战斗能力，甲板上四名深潜者全部倒地。',
      activeNpc: null, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/仅结算3名|不得提前宣告最后一名/);
  });

  it('rejects combat narration that understates the structured remaining count', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 2;

    expect(validateNarratorSemantics({
      narrative: '两名深潜者已经倒地，挟持埃里克的最后一名深潜者仍在抵抗。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/宣称仅剩1名.*尚有2名/);

    expect(validateNarratorSemantics({
      narrative: '甲板上只剩一名深潜者，它正挟持着埃里克。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/宣称仅剩1名.*尚有2名/);

    state.scenarioProgress.encounters.ENC01.defeated = 3;
    expect(validateNarratorSemantics({
      narrative: '挟持埃里克的最后一名深潜者仍在抵抗。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('keeps a locked combat finale from inventing negotiation or reinforcements', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 3;

    expect(validateNarratorSemantics({
      narrative: '交涉代表举起双手：“我们可以谈谈条件，各取所需，不必再流血。”',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/战斗路线.*不得擅自转入交涉/);

    expect(validateNarratorSemantics({
      narrative: '交涉代表冷笑：“船舱里还有十几个我的族人，你们赢不了。”',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得虚构船舱援军/);

    expect(validateNarratorSemantics({
      narrative: '船舱口的铁门打开，更多灰绿色的身影正在涌出。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得虚构船舱援军/);

    expect(validateNarratorSemantics({
      narrative: '交涉代表仍在船尾观望。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '',
      playerChoices: { 罗伯特: ['喝令交涉代表停手，否则继续攻击'] }
    }, [], state, kb)).toBeNull();

    expect(validateNarratorSemantics({
      narrative: '代表用生硬的英语说道：“解开缆绳让我们走，你们带他离开。”',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/战斗路线.*不得擅自转入交涉/);
    expect(validateNarratorSemantics({
      narrative: '代表嘶声道：“够了。我们带货走，人给你们。”',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/战斗路线.*不得擅自转入交涉/);
  });

  it('requires every narrated investigator injury to have an accepted HP update', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    const output = {
      narrative: '铁钩残柄划过亨利前臂，留下一道渗血的伤口。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    };

    expect(validateNarratorSemantics(output, [], state, kb)).toMatch(/负 HP/);
    expect(validateNarratorSemantics(output, [{
      name: 'propose_state_update', arguments: { hp: { 亨利: -1 } }
    }], state, kb)).toBeNull();
  });

  it('requires HP settlement for an adjacent-sentence injury pronoun from real play', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }),
        makeInvestigator({ name: '艾达·华莱士' })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    const narrative = '亨利挥出的拳头擦过深潜者湿滑的鳞片，失去平衡向前踉跄一步。深潜者趁机反手一击，锋利的蹼爪划过他的前臂，鲜血涌出。与此同时，艾达从掩体后冲出。';

    expect(validateNarratorSemantics({
      narrative, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/亨利·格雷.*负 HP/);
    expect(validateNarratorSemantics({
      narrative, nextPrompt: '', playerChoices: {}
    }, [{
      name: 'propose_state_update', arguments: { hp: { '亨利·格雷': -1 } }
    }], state, kb)).toBeNull();
  });

  it('rejects rib injuries and HP loss after an ordinary finale combat failure', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利·格雷' }),
        makeInvestigator({ name: '罗伯特·肖' })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    const output = {
      narrative: '亨利冲向一名深潜者挥拳，但对方鳞片湿滑，拳头滑开，反击的蹼爪划过他的肋部，留下一道血痕。',
      nextPrompt: '', playerChoices: {}
    };
    const actions = [{
      player: '亨利·格雷',
      action: '【检定结果】亨利·格雷 的 格斗（拳）检定：掷出 91，结果：失败。'
    }];

    expect(validateNarratorSemantics(output, [], state, kb, actions)).toMatch(/普通战斗检定失败只推进逃脱时钟/);
    expect(validateNarratorSemantics(output, [{
      name: 'propose_state_update', arguments: { hp: { '亨利·格雷': -1 } }
    }], state, kb, actions)).toMatch(/只有大失败/);
  });

  it('does not replace a declared light with an investigator background item', () => {
    const ada = makeInvestigator({
      name: '艾达',
      background: { meaningfulItem: '战地急救包' }
    });
    const state = makeState({ players: [ada], currentScene: 'S05' });
    const actions = [{ player: '艾达', action: '用灯光照住深潜者，为罗伯特警戒，本轮不攻击。' }];

    expect(validateNarratorSemantics({
      narrative: '艾达举着战地急救包的金属箱挡在身侧，为罗伯特照看侧翼。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/不得把艾达.*灯光替换/);
    expect(validateNarratorSemantics({
      narrative: '艾达的灯光稳稳照住深潜者，为罗伯特照看侧翼。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toBeNull();
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

  it('removes suggestions that tell the party to travel to its current scene', () => {
    const result = sanitizePlayerChoices({
      亨利: ['前往泰晤士港·扶桑花号继续调查', '仔细观察甲板上的动静']
    }, new Set(), kb, 'S05');

    expect(result.亨利).not.toContain('前往泰晤士港·扶桑花号继续调查');
    expect(result.亨利).toContain('仔细观察甲板上的动静');
  });

  it('creates safe current-scene suggestions when the narrator returns an empty choice map', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利' })];
    const result = sanitizePlayerChoices({}, new Set(), kb, 'S04', null, 4, players);

    expect(result.亨利).toHaveLength(3);
    expect(result.亨利).not.toContain('前往卡森其药店继续调查');
  });

  it('keeps finale suggestions within the selected authored route', () => {
    const combat = sanitizePlayerChoices({
      罗伯特: [
        '再次用警棍攻击深潜者',
        '用警棍指向深潜者代表，警告它下令停船',
        '冲向埃里克解开束缚',
        '要求深潜者代表谈判'
      ]
    }, new Set(), kb, 'S05', 'combat');
    expect(combat.罗伯特).toHaveLength(3);
    expect(combat.罗伯特).not.toContain('用警棍指向深潜者代表，警告它下令停船');
    expect(combat.罗伯特.some((choice) => /谈判|交涉/.test(choice))).toBe(false);

    const negotiation = sanitizePlayerChoices({
      艾达: ['专心聆听深潜者的诉求', '拔枪攻击深潜者', '尝试理解对方条件']
    }, new Set(), kb, 'S05', 'negotiation');
    expect(negotiation.艾达).toHaveLength(3);
    expect(negotiation.艾达.some((choice) => /攻击|拔枪/.test(choice))).toBe(false);
  });

  it('uses equipment-aware combat choices and rescue choices only after combat clears', () => {
    const players = [
      makeInvestigator({ id: 'ada', name: '艾达', equipment: [] }),
      makeInvestigator({ id: 'robert', name: '罗伯特', equipment: ['警用警棍', '警用左轮手枪'] })
    ];
    const active = sanitizePlayerChoices({
      艾达: ['攻击一名仍在抵抗的深潜者'],
      罗伯特: ['继续用手枪攻击深潜者']
    }, new Set(), kb, 'S05', 'combat', 1, players);
    expect(active.艾达.every((choice) => !/攻击|挥拳|擒抱|开枪|射击|手枪|武器/.test(choice))).toBe(true);
    expect(active.罗伯特.some((choice) => /手枪/.test(choice))).toBe(true);

    const cleared = sanitizePlayerChoices({
      艾达: ['攻击一名仍在抵抗的深潜者'],
      罗伯特: ['继续攻击深潜者']
    }, new Set(), kb, 'S05', 'combat', 0, players);
    expect(Object.values(cleared).flat().every((choice) => !/攻击|仍在抵抗/.test(choice))).toBe(true);
    expect(cleared.艾达.some((choice) => /寻找埃里克|营救埃里克/.test(choice))).toBe(true);
  });

  it('replaces retreat-only finale choices with unarmed attacks for the default investigator', () => {
    const players = [makeInvestigator(
      { id: 'henry', name: '亨利', equipment: [] },
      { '格斗（拳）': 50 }
    )];
    const result = sanitizePlayerChoices({
      亨利: [
        '趁势追击被逼退的深潜者，继续格斗压制',
        '冲向看守埃里克的那名深潜者，试图突破',
        '暂时后撤与艾达会合，重新评估局势'
      ]
    }, new Set(), kb, 'S05', 'combat', 3, players);

    expect(result.亨利).toHaveLength(3);
    expect(result.亨利.every((choice) => /攻击|挥拳|擒抱/.test(choice))).toBe(true);
    expect(result.亨利.every((choice) => !/开枪|射击|手枪|武器|后撤/.test(choice))).toBe(true);
  });

  it('removes unavailable firearm suggestions before the finale route is chosen', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利', equipment: [] })];
    const result = sanitizePlayerChoices({
      亨利: [
        '继续射击压制深潜者，冲向埃里克',
        '喝令深潜者代表交出埃里克否则继续开火',
        '寻找更好的掩体观察局势变化'
      ]
    }, new Set(), kb, 'S05', 'undecided', 4, players);

    expect(result.亨利.some((choice) => /射击|开火/.test(choice))).toBe(false);
    expect(result.亨利).toContain('寻找更好的掩体观察局势变化');
    expect(result.亨利).toHaveLength(3);
  });

  it('removes finale objective text that describes two routes instead of taking an action', () => {
    const players = [makeInvestigator({ id: 'henry', name: '亨利' })];
    const result = sanitizePlayerChoices({
      亨利: [
        '在扶桑花号上选择阻止深潜者或尝试交涉。',
        '决定以战斗还是交涉解决当前局面',
        '观察埃里克、交涉代表和甲板守卫的当前状态'
      ]
    }, new Set(), kb, 'S05', 'undecided', 4, players);

    expect(result.亨利).not.toContain('在扶桑花号上选择阻止深潜者或尝试交涉。');
    expect(result.亨利).not.toContain('决定以战斗还是交涉解决当前局面');
    expect(result.亨利).toContain('选择暂缓攻击，与深潜者代表进行交涉');
    expect(result.亨利).toHaveLength(3);
  });

  it('removes indirect negotiation suggestions after the combat route is locked', () => {
    const players = [makeInvestigator({ id: 'thomas', name: '托马斯', equipment: [] })];
    const result = sanitizePlayerChoices({
      托马斯: [
        '与船上代表保持距离并听清它的诉求',
        '观察埃里克和甲板守卫的当前状态',
        '寻找掩护观察仍在抵抗的深潜者'
      ]
    }, new Set(), kb, 'S05', 'combat', 2, players);

    expect(result.托马斯).not.toContain('与船上代表保持距离并听清它的诉求');
    expect(result.托马斯).toContain('寻找掩护观察仍在抵抗的深潜者');
    expect(result.托马斯).toHaveLength(3);
  });

  it('removes indirect rescue suggestions while a finale opponent remains', () => {
    const players = [makeInvestigator({ id: 'thomas', name: '托马斯', equipment: [] })];
    const result = sanitizePlayerChoices({
      托马斯: [
        '趁最后一名深潜者后退，冲向埃里克试图解救',
        '继续投掷杂物牵制最后一名深潜者，掩护罗伯特',
        '向最后一名深潜者喊话，警告其放弃抵抗'
      ]
    }, new Set(), kb, 'S05', 'combat', 1, players);

    expect(result.托马斯).not.toContain('趁最后一名深潜者后退，冲向埃里克试图解救');
    expect(result.托马斯.every((choice) => !/解救|救援|营救/.test(choice))).toBe(true);
    expect(result.托马斯).toContain('继续投掷杂物牵制最后一名深潜者，掩护罗伯特');
    expect(result.托马斯).toHaveLength(3);
  });

  it('rejects revolver mechanics borrowed from a semi-automatic pistol', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] })],
      currentScene: 'S05'
    });
    expect(validateNarratorSemantics({
      narrative: '罗伯特的左轮卡壳，弹壳卡死在退壳口，他用力拉动套筒。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/左轮手枪没有半自动手枪/);
  });

  it('rejects invented ammunition tracking while allowing ordinary gunfire narration', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] })],
      currentScene: 'S05'
    });

    expect(validateNarratorSemantics({
      narrative: '六发弹巢中已连射四发，剩余两颗子弹。子弹所剩无几，若再失手就必须重新装填。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未启用弹药计数/);
    expect(validateNarratorSemantics({
      narrative: '枪声响起，子弹击中甲板边沿。左轮弹巢中仅余最后一发。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未启用弹药计数/);
    expect(validateNarratorSemantics({
      narrative: '深潜者仍在逼近。',
      nextPrompt: '', playerChoices: { 罗伯特: ['将手枪抵近射击，最后一发子弹必须命中'] }
    }, [], state, kb)).toMatch(/未启用弹药计数/);
    expect(validateNarratorSemantics({
      narrative: '罗伯特扣下扳机，子弹擦过船舷，枪声在浓雾中炸响。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects rescuing Eric or clearing all enemies before structured combat allows it', () => {
    const state = makeState({ currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.encounters.ENC01.defeated = 3;

    expect(validateNarratorSemantics({
      narrative: '最后一个还在抵抗的深潜者瘫倒不动，艾达喊道：“都倒了！”',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得提前宣告最后一名/);
    expect(validateNarratorSemantics({
      narrative: '艾达用剪刀割断绑住埃里克的粗绳，三人扶着他踏上码头。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得在对应剧情事件结算前/);
    expect(validateNarratorSemantics({
      narrative: '埃里克趁机挣脱，连滚带爬地扑向亨利。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/不得在对应剧情事件结算前/);
    expect(validateNarratorSemantics({
      narrative: '包括交涉代表在内，剩余的深潜者纷纷跳入河中或躲进船舱，敌人的抵抗已经瓦解。',
      nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/尚有1名.*不得提前让剩余敌人全员撤退/);
  });

  it('requires an affirmative combat action before advancing the finale battle', () => {
    const state = makeState({
      currentScene: 'S05',
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] })]
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };

    expect(inferStoryEventFromActions([{
      player: '罗伯特', action: '用警棍指向深潜者代表，警告它下令停船。'
    }], state)).toBeNull();
    expect(inferStoryEventFromActions([{
      player: '罗伯特', action: '继续警戒，但不要攻击深潜者。'
    }], state)).toBeNull();
    expect(inferStoryEventFromActions([{
      player: '罗伯特', action: '配合同伴牵制深潜者，并寻找下一次攻击机会。'
    }], state)).toBeNull();
    expect(buildRequiredCheck([{
      player: '罗伯特', action: '配合同伴牵制深潜者，并寻找下一次攻击机会。'
    }], state)).toBeNull();
    expect(inferStoryEventFromActions([{
      player: '罗伯特', action: '拔出手枪射击最后一名深潜者护卫。'
    }], state)).toEqual(expect.objectContaining({
      arguments: expect.objectContaining({ eventId: 'EV_COMBAT_ATTACK' })
    }));
  });

  it('rejects narration that contradicts the active authored NPC appearance', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    expect(validateNarratorSemantics({
      narrative: '吧台后站着一个壮实的中年男人，正用布擦拭酒杯。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
    expect(validateNarratorSemantics({
      narrative: '吧台后站着一个矮胖的中年男人，正用布擦拭酒杯。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
    expect(validateNarratorSemantics({
      narrative: '酒馆里，一名身材发福、留着乱糟糟胡子的酒保正在吧台后擦杯子。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
    expect(validateNarratorSemantics({
      narrative: '清瘦的中年酒保站在吧台后擦拭酒杯，下巴刮得干净。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
    expect(validateNarratorSemantics({
      narrative: '清瘦的中年酒保摸了摸浓密胡须。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
  });

  it('audits the resident NPC that the UI will focus when a transition returns null', () => {
    const state = makeState({ currentScene: 'S02', activeNpcName: '洛夫·蒙特利尔' });
    const sceneCall = [{
      name: 'propose_scene_change' as const,
      arguments: { targetSceneId: 'S03', reason: '玩家前往酒吧' }
    }];

    expect(validateNarratorSemantics({
      narrative: '你们抵达老赫特酒吧，吧台后站着一个身材粗壮的酒保，正用脏毛巾擦拭玻璃杯。',
      activeNpc: null,
      nextPrompt: '如何询问？',
      playerChoices: {}
    }, sceneCall, state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
    expect(validateNarratorSemantics({
      narrative: '你们抵达老赫特酒吧，清瘦的中年酒保在吧台后擦拭酒杯，下巴刮得干净。',
      activeNpc: null,
      nextPrompt: '如何询问？',
      playerChoices: {}
    }, sceneCall, state, kb)).toBeNull();
  });

  it('audits a same-scene NPC retained because null output still narrates them', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });

    expect(validateNarratorSemantics({
      narrative: '老赫特酒保粗壮的手臂撑在吧台上，浓密胡须沾着酒沫。',
      activeNpc: null,
      nextPrompt: '继续交谈。',
      playerChoices: {}
    }, [], state, kb)).toMatch(/人物外貌.*老赫特之家酒保/);
  });

  it('rejects invented weapons, unsafe medical advice and arrival without state change', () => {
    const state = makeState({ currentScene: 'S01' });
    expect(validateNarratorSemantics({
      narrative: '亨利拔出手枪警戒。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/枪械/);
    expect(validateNarratorSemantics({
      narrative: '亨利紧握手枪，艾达握紧急救包的带子。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/枪械/);
    expect(validateNarratorSemantics({
      narrative: '亨利举枪警戒。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/枪械/);
    const armed = makeState({
      currentScene: 'S01',
      players: [makeInvestigator({ name: '亨利', equipment: ['.32左轮手枪'] })]
    });
    expect(validateNarratorSemantics({
      narrative: '亨利拔出左轮手枪警戒。', nextPrompt: '', playerChoices: {}
    }, [], armed, kb)).toBeNull();
    const mixedParty = makeState({
      currentScene: 'S01',
      players: [
        makeInvestigator({ name: '艾达', equipment: [] }),
        makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] })
      ]
    });
    expect(validateNarratorSemantics({
      narrative: '艾达拔出左轮手枪警戒，罗伯特守在她身边。', nextPrompt: '', playerChoices: {}
    }, [], mixedParty, kb)).toMatch(/艾达没有被记录的枪械/);
    expect(validateNarratorSemantics({
      narrative: '艾达建议注射活性炭。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/医疗/);
    expect(validateNarratorSemantics({
      narrative: '你们很快抵达卡森其药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/场景切换/);
    expect(validateNarratorSemantics({
      narrative: '火柴照亮药房内部，货架倾倒，玻璃碎片散落一地。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/当前环境|锁定地点/);
    expect(validateNarratorSemantics({
      narrative: '马车已经到达码头区。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/场景切换/);
    expect(validateNarratorSemantics({
      narrative: '酒保让你们沿泰晤士街过铁桥寻找药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/未声明的街道/);
    const finale = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    expect(validateNarratorSemantics({
      narrative: '扶桑花号的引擎开始轰鸣，船长正准备强行离港。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], finale, kb)).toMatch(/没有已登记的船长/);
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
    }, [], state, kb)).toMatch(/activeNpc|提前点名蒙特利尔/);
  });

  it('rejects an unregistered staff member who actively guides a scene transition', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F05'];
    const sceneCall = [{
      name: 'propose_scene_change' as const,
      arguments: { targetSceneId: 'S02', reason: '玩家前往警局' }
    }];

    expect(validateNarratorSemantics({
      narrative: '你们抵达上城区第二分局，前台值班警员将你们引至二楼局长办公室，蒙特利尔局长冷淡地抬起头。',
      activeNpc: null,
      nextPrompt: '如何质询？',
      playerChoices: {}
    }, sceneCall, state, kb)).toMatch(/当前场景没有已登记的警员/);
  });

  it('requires the authored bartender event before revealing the rat lead', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B04 = 'active';
    const output = {
      narrative: '酒保收下银币，低声说老鼠在贝尔街14号的废弃药店活动。',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '要立刻动身吗？',
      playerChoices: {}
    };

    expect(validateNarratorSemantics(output, [], state, kb)).toMatch(/EV_BARTENDER_RAT/);
    expect(validateNarratorSemantics(output, [{
      name: 'propose_story_event', arguments: { eventId: 'EV_BARTENDER_RAT' }
    }], state, kb)).toBeNull();
  });

  it('does not strand investigators outside S04 after its authored entry event has settled', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];
    const move = [{ name: 'propose_scene_change', arguments: { targetSceneId: 'S04' } }] as const;

    expect(validateNarratorSemantics({
      narrative: '你们抵达卡森其药店，木门紧闭，锁头上落着灰尘，只能留在门外。',
      activeNpc: null, nextPrompt: '想办法开门。', playerChoices: { 亨利: ['撬开药店门锁'] }
    }, [...move], state, kb)).toMatch(/S04 入场事件/);
    expect(validateNarratorSemantics({
      narrative: '你们来到贝尔街14号。罗伯特上前推了推正门，锁着。他绕到侧面，托马斯推开后门，走进漆黑的店铺。',
      activeNpc: null,
      nextPrompt: '接下来怎么办？',
      playerChoices: { 托马斯: ['先退出去从正门想办法'] }
    }, [...move], state, kb)).toMatch(/S04 入场事件/);
    expect(validateNarratorSemantics({
      narrative: '你们抵达卡森其药店。木门歪斜，亨利推开门，铰链发出刺耳声响，随后走进店内。',
      activeNpc: null, nextPrompt: '调查店内。', playerChoices: { 艾达: ['搜查后厅'] }
    }, [...move], state, kb)).toMatch(/切场正文不得再让调查员开门进入一次/);
    expect(validateNarratorSemantics({
      narrative: '非人身影从内侧撞开后门撤离，你们随即进入卡森其药店，店内浓雾涌动。',
      activeNpc: null, nextPrompt: '在店内调查。', playerChoices: { 亨利: ['检查后厅的油布包'] }
    }, [...move], state, kb)).toBeNull();
  });

  it('does not repeat S04 entry or reveal an unseen follower after a failed check', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.firedEventIds = ['EV_S04_FOG'];

    expect(validateNarratorSemantics({
      narrative: '在托马斯的协助下，你们推开了卡森其药店腐朽的后门。',
      activeNpc: null, nextPrompt: '进入店内。', playerChoices: {}
    }, [], state, kb)).toMatch(/已经结算.*重复开门/);
    expect(validateNarratorSemantics({
      narrative: '这是卡森其药店首次进入，需要先触发进入事件。',
      activeNpc: null, nextPrompt: '先触发入场事件。',
      playerChoices: { 亨利: ['前往卡森其药店继续调查'] }
    }, [], state, kb)).toMatch(/已经结算.*首次进入仍待触发/);
    expect(validateNarratorSemantics({
      narrative: '罗伯特完全没有发现远处屋檐下那道一闪而过的人影。',
      activeNpc: null, nextPrompt: '继续调查。', playerChoices: {}
    }, [], state, kb)).toMatch(/全知叙事.*未察觉/);
    expect(validateNarratorSemantics({
      narrative: '罗伯特没能分辨街上的脚步声，你们已经站在药店后厅内。',
      activeNpc: null, nextPrompt: '调查后厅。', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects an invented internal route after investigators enter S04', () => {
    const entering = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    entering.scenarioProgress = createScenarioProgress();
    entering.scenarioProgress.knownFactIds = ['F08'];
    const move = [{ name: 'propose_scene_change', arguments: { targetSceneId: 'S04' } }] as const;
    const inventedDoor = {
      narrative: '你们进入卡森其药店。柜台后面的暗门微微敞开，隐约有凉风从深处吹来。',
      activeNpc: null,
      nextPrompt: '要进入暗门后的空间吗？',
      playerChoices: { 艾达: ['检查地上的纸张', '直接走向暗门'] }
    };

    expect(validateNarratorSemantics(inventedDoor, [...move], entering, kb))
      .toMatch(/权威场景数据没有暗门/);

    const settled = makeState({ currentScene: 'S04', activeNpcName: null });
    settled.scenarioProgress = createScenarioProgress();
    settled.scenarioProgress.firedEventIds = ['EV_S04_FOG'];
    expect(validateNarratorSemantics({
      narrative: '你们站在已经进入的药店后厅，倒塌货架与柜台都在眼前。',
      activeNpc: null,
      nextPrompt: '继续调查后厅。',
      playerChoices: { 艾达: ['搜查后厅的油布包', '检查柜台附近的烟灰'] }
    }, [], settled, kb)).toBeNull();
  });

  it('requires an authorized check whenever narration says a check is mandatory', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    const output = {
      narrative: '浓雾遮住甲板深处，接下来的行动存在失败风险，需要先进行侦查检定。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '确认周围安全后再决定如何应对。',
      playerChoices: {}
    };

    expect(validateNarratorSemantics(output, [], state, kb)).toMatch(/request_check/);
    expect(validateNarratorSemantics(output, [{
      name: 'request_check',
      arguments: { player: '亨利', skill: '侦查', difficulty: '普通', reason: '观察甲板' }
    }], state, kb)).toBeNull();
  });

  it('rejects exact invented clocks and highly repetitive narration', () => {
    const state = makeState();
    expect(validateNarratorSemantics({
      narrative: '晚上10点，调查员决定继续行动。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/世界时钟/);
    expect(validateNarratorSemantics({
      narrative: '吧台后的老钟敲了六下，已是傍晚六点。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/世界时间/);

    const repeated = '雨水敲打窗户，亨利检查桌面，艾达站在门边警戒，屋内没有出现新的变化。';
    state.messages = [{ id: 'old', type: 'dm', text: repeated }];
    expect(validateNarratorSemantics({
      narrative: repeated, nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/高度重复/);
  });

  it('rejects treating a merely discussed destination as the current environment', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null, clueIds: ['I07'] });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08', 'F09'];

    expect(validateNarratorSemantics({
      narrative: '两人铺开地图核对港口标记。老赫特酒吧里酒客们仍在低声闲聊，吧台后的老钟缓缓走着。',
      activeNpc: null,
      nextPrompt: '是否继续整理地图？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/当前环境/);

    expect(validateNarratorSemantics({
      narrative: '两人在卡森其药店核对地图，准备稍后返回老赫特酒吧，但现在不动身。',
      activeNpc: null,
      nextPrompt: '是否继续整理地图？',
      playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('requires an accepted scene change to narrate the destination as already current', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null, clueIds: ['I07'] });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];
    const sceneCall = [{
      name: 'propose_scene_change' as const,
      arguments: { targetSceneId: 'S05', reason: '玩家明确前往扶桑花号' }
    }];

    expect(validateNarratorSemantics({
      narrative: '根据权威剧情状态，你们目前仍在卡森其药店，尚未抵达泰晤士港。你们朝港口方向走去。',
      activeNpc: null,
      nextPrompt: '是否沿地图路线继续前行？',
      playerChoices: { 托马斯: ['沿地图路线继续前行至扶桑花号泊位'] }
    }, sceneCall, state, kb)).toMatch(/原子结算/);

    expect(validateNarratorSemantics({
      narrative: '你们抵达泰晤士港的偏僻泊位，扶桑花号在浓雾中准备离港；扶桑花号交涉代表在栈桥前警惕地观察你们。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '如何应对？',
      playerChoices: {}
    }, sceneCall, state, kb)).toBeNull();
  });

  it('rejects off-scene thugs substituted for the finale NPC during a real scene transition', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null, clueIds: ['I07'] });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F09'];
    const sceneCall = [{
      name: 'propose_scene_change' as const,
      arguments: { targetSceneId: 'S05', reason: '玩家明确前往扶桑花号' }
    }];
    const liveOutput = {
      narrative: '你沿泰晤士河拐入一段废弃码头区，远处泊位上隐约可见一艘旧货船。三个身影从雾气中钻出，将退路堵死。为首的一人低声喝道：“别动，朋友。”',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '如何应对？',
      playerChoices: {
        艾达: ['尝试用冷静的语气安抚暴徒，询问他们的来意', '后退寻找掩体，观察暴徒的武器和人数']
      }
    };

    expect(validateNarratorSemantics(liveOutput, sceneCall, state, kb))
      .toMatch(/明确识别活动 NPC|未授权 NPC|已登记人物/);
  });

  it('rejects an unidentified speaking group in S05 after the transition is complete', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B06 = 'active';

    expect(validateNarratorSemantics({
      narrative: '三个身影从雾气中钻出，将退路堵死。为首的一人低声喝道：“别动。”',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '如何应对？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/已登记人物|剧情事件/);
  });

  it('keeps conditionally due S04 thugs out of free narration so the automatic event owns them', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.variables.metMontreal = true;
    state.scenarioProgress.worldTime = '1920-07-13T19:05';
    const output = {
      narrative: '三名身份不明的暴徒追到贝尔街，短暂封住药店外的退路后消失在浓雾中。',
      activeNpc: null,
      nextPrompt: '继续调查药店。',
      playerChoices: {}
    };

    expect(validateNarratorSemantics(output, [], state, kb)).toMatch(/未授权 NPC|已登记人物/);
  });

  it('rejects unauthorised schedule and route details invented for a known clue', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null, clueIds: ['I07'] });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08', 'F09'];

    expect(validateNarratorSemantics({
      narrative: '地图角落写着扶桑花号将在7月14日开船。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/日期|行动时刻/);
    expect(validateNarratorSemantics({
      narrative: '地图标出了泊位编号、仓库布局和一条绕过海关检查站的路线。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/路线或设施/);
    expect(validateNarratorSemantics({
      narrative: '潮湿的地图笔记标出扶桑花号泊位，仓库排列清晰可辨。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/路线或设施/);
    expect(validateNarratorSemantics({
      narrative: '地图笔记标出了泰晤士港扶桑花号的停泊位置。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {}
    }, [], state, kb)).toBeNull();
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
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F06'];
    expect(validateNarratorSemantics({
      narrative: '可靠线索指向贝尔街14号卡森其药店。', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects premature rescue and departure claims unless an available event authorizes them', () => {
    const opening = makeState({ currentScene: 'S01' });
    expect(validateNarratorSemantics({
      narrative: '埃里克已经获救，扶桑花号也驶离泊位。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);
    expect(validateNarratorSemantics({
      narrative: '亨利找到埃里克后割断绳索，将他扶回甲板。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);
    expect(validateNarratorSemantics({
      narrative: '亨利终于扯开了粗糙的绳结，获救的埃里克大口喘着气。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);
    expect(validateNarratorSemantics({
      narrative: '扶桑花号的船身已开始缓缓脱离泊位，缆绳崩断的声音在雾中回荡。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);
    expect(validateNarratorSemantics({
      narrative: '扶桑花号已完全脱离泊位，船身在雾中缓缓移动，水面传来沉闷的引擎声。', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/剧情结果/);

    const failedFinale = makeState({ currentScene: 'S05' });
    failedFinale.scenarioProgress = createScenarioProgress();
    failedFinale.scenarioProgress.endingId = 'END_B';
    failedFinale.scenarioProgress.variables.ericRescued = false;
    expect(validateNarratorSemantics({
      narrative: '获救的埃里克躲到木箱后。', nextPrompt: '', playerChoices: {}
    }, [], failedFinale, kb)).toMatch(/剧情结果/);

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

  it('rejects authored clue discoveries that have no matching structured event', () => {
    const state = makeState({ currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';

    expect(validateNarratorSemantics({
      narrative: '你在墨水瓶下发现一张写有“别来找我”的便签。',
      nextPrompt: '继续搜查吗？',
      playerChoices: {}
    }, [], state, kb)).toMatch(/EV_FIND_I01/);

    expect(validateNarratorSemantics({
      narrative: '你在墨水瓶下发现一张写有“别来找我”的便签。',
      nextPrompt: '继续搜查吗？',
      playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I01' } }], state, kb)).toBeNull();
  });

  it('rejects opening narration that leaks the dock, hands over I02, or invents Montreal involvement', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    state.scenarioProgress = createScenarioProgress();
    const accept = [{
      name: 'propose_story_event' as const,
      arguments: { eventId: 'EV_ACCEPT_COMMISSION' }
    }];

    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说老赫特酒吧就在码头区附近。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, accept, state, kb)).toMatch(/锁定地点.*码头区/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说父亲失踪当天去码头区办事。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, accept, state, kb)).toMatch(/失踪前的未授权行踪细节/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉从桌上推过一个信封，里面还有父亲最近的一张照片。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, accept, state, kb)).toMatch(/合影照片.*无可用事件/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说她报案后，蒙特利尔局长承诺会调查，但至今没有进展。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, accept, state, kb)).toMatch(/未解锁人物介入调查|提前点名蒙特利尔/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说：“蒙特利尔局长接手了案子，但他告诉我目前没有任何线索。”',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {
        亨利: ['询问埃里克是否有仇人或近期经济纠纷']
      }
    }, accept, state, kb)).toMatch(/未解锁人物介入调查|提前点名蒙特利尔|财务背景/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说父亲在失踪那天早上要去老赫特之家处理事情。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, accept, state, kb)).toMatch(/失踪前的未授权行踪细节/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉没有更多可核实的信息。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {
        亨利: ['在摩勒住宅寻找能指向警局、酒吧或贝尔街的证据。']
      }
    }, accept, state, kb)).toMatch(/提前透露贝尔街/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉确认父亲于三日前失踪，警方没有取得进展，他平时常去老赫特酒吧。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否调查住宅？', playerChoices: {}
    }, accept, state, kb)).toBeNull();
  });

  it('allows an authored NPC to repeat non-authoritative local color and known leads', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    expect(validateNarratorSemantics({
      narrative: '酒保想了想：“我听说老鼠最近在贝尔街活动。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '还要继续追问吗？',
      playerChoices: {}
    }, [], state, kb)).toBeNull();

    expect(validateNarratorSemantics({
      narrative: '酒保摇头：“关于老鼠，我不知道更多，也不敢胡乱猜测。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '是否前往已知地点？',
      playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects an identifiable companion invented during a bartender follow-up', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    expect(validateNarratorSemantics({
      narrative: '酒保压低嗓音：“最后一次见摩勒先生，大概三天前，也就是十号傍晚。他和一个穿旧大衣的男人一起走的，那人戴顶软呢帽，往贝尔街方向去了。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '还要追问吗？',
      playerChoices: { 亨利: ['请酒保描述那个穿旧大衣男人的更多细节'] }
    }, [], state, kb)).toMatch(/目击时间|同行者|新人物/);

    expect(validateNarratorSemantics({
      narrative: '酒保摇头：“我只知道老鼠的消息指向贝尔街，没见过埃里克当晚和谁同行。”',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '是否前往已知地点？',
      playerChoices: { 亨利: ['前往卡森其药店'] }
    }, [], state, kb)).toBeNull();
  });

  it('rejects a police-scene leak of Bell Street before an authored lead reveals it', () => {
    const state = makeState({ currentScene: 'S02', activeNpcName: '洛夫·蒙特利尔' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F05'];
    state.scenarioProgress.visitedSceneIds = ['S01', 'S02'];
    state.scenarioProgress.firedEventIds = ['EV_ACCEPT_COMMISSION', 'EV_FIND_I02', 'EV_MEET_MONTREAL'];
    state.scenarioProgress.variables.oldHethLead = true;
    state.scenarioProgress.variables.metMontreal = true;

    expect(validateNarratorSemantics({
      narrative: '蒙特利尔停顿片刻，最后说：“想知道埃里克的事，去贝尔街问问那些酒鬼。”',
      activeNpc: '洛夫·蒙特利尔',
      nextPrompt: '是否离开分局？',
      playerChoices: { 亨利: ['前往老赫特酒吧，追问贝尔街线索'] }
    }, [], state, kb)).toMatch(/提前透露贝尔街/);

    state.scenarioProgress.knownFactIds.push('F06');
    expect(validateNarratorSemantics({
      narrative: '蒙特利尔拒绝继续回答。',
      activeNpc: '洛夫·蒙特利尔',
      nextPrompt: '是否离开分局？',
      playerChoices: { 亨利: ['依照已知地址前往贝尔街14号'] }
    }, [], state, kb)).toBeNull();
  });

  it('rejects unsupported identity, criminal relationship, injury, and threat claims', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B04 = 'active';
    state.scenarioProgress.variables.oldHethLead = true;

    const event = [{ name: 'propose_story_event', arguments: { eventId: 'EV_BARTENDER_RAT' } }] as const;
    expect(validateNarratorSemantics({
      narrative: '酒保指出贝尔街14号的废弃药店，又说：“老鼠是个东欧口音的瘦子，埃里克替他运过几次货，后来不想干了。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/人物身份|犯罪、交易/);
    expect(validateNarratorSemantics({
      narrative: '酒保先指出贝尔街14号的废弃药店，又说埃里克脸上有淤青，嘴角肿着，像是被人盯上了。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/伤情|威胁经历/);
    expect(validateNarratorSemantics({
      narrative: '酒保指出贝尔街14号的废弃药店，又说那地方晚上有灯光、马车进出并转运货物，蒙特利尔的人也去过。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/未调查地点的活动细节/);
    expect(validateNarratorSemantics({
      narrative: '酒保指出贝尔街14号的废弃药店，又说：“那地方最近有人进出。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/未调查地点的活动细节/);
    expect(validateNarratorSemantics({
      narrative: '酒保说：“我只知道他脸上有伤，手在发抖。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/伤情/);
    expect(validateNarratorSemantics({
      narrative: '酒保指出贝尔街14号的废弃药店，又说：“他最后一次来是周二晚上。那个老鼠瘦小、驼背，戴着软帽，总在码头附近转悠。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/人物身份|目击时间|行踪/);
    expect(validateNarratorSemantics({
      narrative: '酒保指出贝尔街14号的废弃药店，又说：“入口在后巷，锁已经坏了。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/未调查地点的活动细节/);
    expect(validateNarratorSemantics({
      narrative: '酒保朝门外努嘴：“贝尔街往东走，穿过两个路口就到。”',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/具体路线指引/);
    expect(validateNarratorSemantics({
      narrative: '酒保说埃里克偶尔带着油布包，里面像是文书或账本；他最后一次来是在七月初。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/包裹或账本证词/);

    const bookletState = makeState({ currentScene: 'S03' });
    bookletState.scenarioProgress = createScenarioProgress();
    bookletState.scenarioProgress.clueStates.I04 = 'discovered';
    bookletState.clues = [{ id: 'I04', name: '小册子', description: '', discoveredAt: 1 }];
    expect(validateNarratorSemantics({
      narrative: '小册子夹页显出“C.S.”、“BELL ST”和“Delivery 07/10”，像是定期货物交接安排。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I04' } }], bookletState, kb))
      .toMatch(/未授权编码或交接记录/);

    const opening = makeState({ currentScene: 'S01' });
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说埃里克参与毒品运输，后来被同伙绑架。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [], opening, kb)).toMatch(/犯罪、交易/);
  });

  it('does not reveal the hidden Montreal betrayal claim through Eric at the finale', () => {
    const state = makeState({ currentScene: 'S05', activeNpcName: '扶桑花号交涉代表' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F05', 'F08', 'F10'];
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';

    expect(validateNarratorSemantics({
      narrative: '埃里克焦急地低声说道：“他们要把货和我一起带走……蒙特利尔那个混蛋，他出卖了我！”',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/背叛或出卖事实/);

    expect(validateNarratorSemantics({
      narrative: '埃里克焦急地看着调查员；甲板冲突仍在继续。',
      activeNpc: '扶桑花号交涉代表', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('rejects invented Montreal investigation results beyond the authored meeting event', () => {
    const state = makeState({ currentScene: 'S02', activeNpcName: '洛夫·蒙特利尔' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B03 = 'active';
    state.scenarioProgress.objectiveStates.O03 = 'active';
    state.scenarioProgress.knownFactIds = ['F05'];
    const event = [{ name: 'propose_story_event', arguments: { eventId: 'EV_MEET_MONTREAL' } }] as const;

    expect(validateNarratorSemantics({
      narrative: '蒙特利尔承认埃里克是旧识，又称失踪案已经派人调查过，没有发现可疑之处。',
      activeNpc: '洛夫·蒙特利尔', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toMatch(/未解锁人物介入调查/);
    expect(validateNarratorSemantics({
      narrative: '蒙特利尔回避关键问题，并冷淡地结束了会面。',
      activeNpc: '洛夫·蒙特利尔', nextPrompt: '', playerChoices: {}
    }, [...event], state, kb)).toBeNull();
  });

  it('keeps relative time-of-day language aligned with the structured world clock', () => {
    const state = makeState({ currentScene: 'S03', activeNpcName: '老赫特之家酒保' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.worldTime = '1920-07-13T18:30';

    expect(validateNarratorSemantics({
      narrative: '两人在午后的薄雾里走进酒吧。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/时段.*世界时间/);
    expect(validateNarratorSemantics({
      narrative: '入夜前的薄雾渐浓，两人走进酒吧。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });

  it('keeps the opening commission within authored testimony', () => {
    const opening = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    opening.scenarioProgress = createScenarioProgress();
    const accept = [{ name: 'propose_story_event', arguments: { eventId: 'EV_ACCEPT_COMMISSION' } }] as const;

    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说她在西区分局报了案，但没有进展。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [...accept], opening, kb)).toMatch(/未声明的警局/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说她11号一早报案，接待警员做了笔录。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [...accept], opening, kb)).toMatch(/报案日期|受理流程/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说父女因埃里克最近花钱的事大吵了一架。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [...accept], opening, kb)).toMatch(/家庭争执|财务背景/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说蒙特利尔认识父亲，还答应亲自关照。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [...accept], opening, kb)).toMatch(/人物关系|提前点名蒙特利尔/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉确认父亲于7月10日失踪，警方没有进展；他平日会去老赫特酒吧。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否检查书房？', playerChoices: {
        托马斯: ['搜查书房的公开物品']
      }
    }, [...accept], opening, kb)).toBeNull();
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉确认父亲于7月10日失踪，警方没有进展。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {
        托马斯: ['追问父女因花钱争吵的金额']
      }
    }, [...accept], opening, kb)).toMatch(/家庭争执|财务背景/);
    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉避开了关于债务的问题。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '她等待下一问。', playerChoices: {
        托马斯: ['追问债务']
      }
    }, [], opening, kb)).toBeNull();
    const searching = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    searching.scenarioProgress = createScenarioProgress();
    searching.scenarioProgress.beatStates.B01 = 'completed';
    searching.scenarioProgress.beatStates.B02 = 'active';
    expect(validateNarratorSemantics({
      narrative: '合影把埃里克与蒙特利尔联系起来，警察局成为了明确的去处。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否前往上城区第二分局？', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I02' } }], searching, kb))
      .toBeNull();
  });

  it('rejects unauthorised evidence and personal history from free investigation', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    const actions = [
      { player: '艾达', action: '检查厨房里的餐盘和食材，但不搜查书桌或书架。' },
      { player: '托马斯', action: '检查门厅衣帽架和旅行箱。' },
      { player: '艾达', action: '【检定结果】艾达 的 侦查 检定：掷出 19，阈值 50，结果：困难成功（19）。' }
    ];

    expect(validateNarratorSemantics({
      narrative: '艾达注意到冰箱角落有一包未拆封的鸦片酊药瓶。托马斯发现雨衣带有新鲜泥渍，说明埃里克失踪当天可能冒雨外出。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/新物证或物理痕迹/);

    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉确认父亲近几个月睡不好，每晚都长期服用鸦片酊。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/病史、用药史或生活习惯/);

    expect(validateNarratorSemantics({
      narrative: '伊莎贝拉说明住宅没有专门的管家，信件和报纸都由她亲自从信箱取回，也没有登记访客的习惯。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/家务人员、通信或访客习惯/);

    expect(validateNarratorSemantics({
      narrative: '托马斯把已有信息重新分栏，仍把鸦片酊用量标成可疑但未核实。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}
    }, [], state, kb, actions)).toMatch(/未登记的药物细节/);

    expect(validateNarratorSemantics({
      narrative: '厨房与门厅没有提供更多可核实的信息，伊莎贝拉也无法确认新的细节。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '你们可以转向已有线索。', playerChoices: {}
    }, [], state, kb, actions)).toBeNull();
  });

  it('does not mistake movement around the current precinct for a new police location', () => {
    const state = makeState({ currentScene: 'S02', activeNpcName: '洛夫·蒙特利尔' });
    const narratives = [
      '蒙特利尔结束会面，你们走出分局，在门廊下整理笔记。',
      '你们离开分局，没有继续追问。',
      '你们返回分局，只核对此前记下的答复。',
      '值班警员点头致意，你们转身推开分局玻璃门。'
    ];

    for (const narrative of narratives) {
      expect(validateNarratorSemantics({
        narrative,
        activeNpc: '洛夫·蒙特利尔',
        nextPrompt: '',
        playerChoices: {}
      }, [], state, kb)).toBeNull();
    }
  });

  it('does not overturn a failed lock-picking check by letting another investigator auto-succeed', () => {
    const state = makeState({ currentScene: 'S04', activeNpcName: null });
    const actions = [
      { player: '艾达', action: '用工具谨慎撬开药店门锁。' },
      { player: '罗伯特', action: '在她撬锁时提供照明。' },
      { player: '艾达', action: '【检定结果】艾达 的 机械维修 检定：掷出 78，阈值 45，结果：失败（78）。' }
    ];

    expect(validateNarratorSemantics({
      narrative: '艾达的工具滑脱。罗伯特接过工具，终于听见咔哒一声，门锁弹开。',
      activeNpc: null,
      nextPrompt: '',
      playerChoices: {}
    }, [], state, kb, actions)).toMatch(/不得让另一角色无检定接手/);

    expect(validateNarratorSemantics({
      narrative: '罗伯特用警棍抵住门锁一撬，老旧锁扣应声脱落，门板向内敞开。',
      activeNpc: null,
      nextPrompt: '',
      playerChoices: {}
    }, [], state, kb, actions)).toMatch(/不得让另一角色无检定接手/);

    expect(validateNarratorSemantics({
      narrative: '艾达的工具滑脱，门锁仍然紧闭。你们需要寻找别的入口或承担新的风险。',
      activeNpc: null,
      nextPrompt: '',
      playerChoices: {}
    }, [], state, kb, actions)).toBeNull();
  });

  it('does not add transport markings to the booklet before analysis', () => {
    const searching = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });
    searching.scenarioProgress = createScenarioProgress();
    searching.scenarioProgress.beatStates.B01 = 'completed';
    searching.scenarioProgress.beatStates.B02 = 'active';

    expect(validateNarratorSemantics({
      narrative: '托马斯找到一本小册子，封面印着货物运输的标识，夹页似乎经过特殊处理。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '要分析夹页吗？', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_DISCOVER_I04' } }], searching, kb))
      .toMatch(/尚未分析/);
    expect(validateNarratorSemantics({
      narrative: '托马斯找到一本受潮的小册子，夹页似乎经过特殊处理。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '要分析夹页吗？', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_DISCOVER_I04' } }], searching, kb))
      .toBeNull();

    searching.scenarioProgress.clueStates.I04 = 'discovered';
    searching.clues = [{ id: 'I04', name: '小册子', description: '', discoveredAt: 1 }];
    expect(validateNarratorSemantics({
      narrative: '小册子夹页上的隐写字迹逐渐清晰浮现。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否前往药店？', playerChoices: {}
    }, [], searching, kb)).toMatch(/EV_FIND_I04/);
    expect(validateNarratorSemantics({
      narrative: '加热小册子夹页，显出隐写文字“贝尔街14号卡森其药店”。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否前往药店？', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I04' } }], searching, kb))
      .toBeNull();
    expect(validateNarratorSemantics({
      narrative: '加热小册子夹页，显出“贝尔街14号卡森其药店，提货后转运至扶桑花号”。',
      activeNpc: '伊莎贝拉·摩勒', nextPrompt: '是否前往药店？', playerChoices: {}
    }, [{ name: 'propose_story_event', arguments: { eventId: 'EV_FIND_I04' } }], searching, kb))
      .toMatch(/锁定地点.*扶桑花号/);
  });

  it('keeps descriptive time of day aligned with the structured clock', () => {
    const state = makeState({ currentScene: 'S03' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.worldTime = '1920-07-13T18:55';

    expect(validateNarratorSemantics({
      narrative: '你们收好笔记，酒吧外夜色已深。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toMatch(/20:00 前不得写成深夜/);
    expect(validateNarratorSemantics({
      narrative: '你们收好笔记，酒吧外天色渐暗。',
      activeNpc: '老赫特之家酒保', nextPrompt: '', playerChoices: {}
    }, [], state, kb)).toBeNull();
  });
});
