import { describe, expect, it } from 'vitest';
import {
  createScenarioProgress,
  getActiveScenarioBeat,
  getAvailableSceneExits,
  getAvailableStoryEvents,
  getVisibleScenarioObjectives,
  hydrateScenarioProgress,
  migrateLegacyScenarioProgress,
  processScenarioTurn,
  ScenarioContentMismatchError
} from '../../src/scenario/engine';
import type { ScenarioProgress, SceneId } from '../../src/types/game';

function apply(
  progress: ScenarioProgress,
  currentScene: SceneId,
  turn: number,
  options: {
    previousScene?: SceneId;
    events?: string[];
    completeTurn?: boolean;
    check?: { id: string; outcome: 'crit' | 'hard' | 'success' | 'fail' | 'fumble' };
  } = {}
) {
  return processScenarioTurn(progress, {
    currentScene,
    previousScene: options.previousScene,
    storyEventIds: options.events,
    turn,
    completeTurn: options.completeTurn ?? true,
    checkResult: options.check,
    actorName: '亨利',
    random: () => 0
  });
}

function reachFinale(): ScenarioProgress {
  let progress = createScenarioProgress();
  progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
  progress = apply(progress, 'S01', 2, { events: ['EV_DISCOVER_I04', 'EV_FIND_I04'] }).progress;
  progress = apply(progress, 'S04', 3, { previousScene: 'S01' }).progress;
  progress = apply(progress, 'S04', 4, { events: ['EV_S04_MAP'] }).progress;
  progress = apply(progress, 'S05', 5, { previousScene: 'S04' }).progress;
  return progress;
}

describe('scenario progression engine', () => {
  it('combines spatial adjacency with story prerequisites', () => {
    let progress = createScenarioProgress();
    expect(getAvailableSceneExits(progress, 'S01')).toEqual([]);

    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    expect(getAvailableSceneExits(progress, 'S01').map((exit) => exit.sceneId)).toEqual(['S03']);

    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I02'] }).progress;
    expect(getAvailableSceneExits(progress, 'S01').map((exit) => exit.sceneId)).toEqual(['S02', 'S03']);
  });

  it('settles a source-scene event before moving to the next scene in the same turn', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I02'] }).progress;
    progress = apply(progress, 'S02', 3, { previousScene: 'S01' }).progress;

    const moved = apply(progress, 'S03', 4, {
      previousScene: 'S02',
      events: ['EV_MEET_MONTREAL']
    });

    expect(moved.firedEventIds).toContain('EV_MEET_MONTREAL');
    expect(moved.progress.variables.metMontreal).toBe(true);
    expect(moved.progress.beatStates.B03).toBe('completed');
    expect(moved.progress.objectiveStates.O03).toBe('completed');
    expect(moved.progress.visitedSceneIds).toContain('S03');
  });

  it('keeps unfired manual clue events available after their beat completes', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I02'] }).progress;

    expect(progress.beatStates.B02).toBe('completed');
    expect(progress.objectiveStates.O02).toBe('completed');
    expect(getAvailableStoryEvents(progress, 'S01').map((event) => event.id)).toContain('EV_DISCOVER_I04');

    progress = apply(progress, 'S01', 3, { events: ['EV_DISCOVER_I04', 'EV_FIND_I04'] }).progress;
    expect(progress.clueStates.I04).toBe('analyzed');
    expect(progress.knownFactIds).toContain('F06');
  });

  it('applies every authored failure-forward clue event from one failed search', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    const failedSearch = apply(progress, 'S01', 2, {
      events: ['EV_FAIL_I01', 'EV_FAIL_I02', 'EV_FIND_I03', 'EV_FAIL_I04', 'EV_FAIL_I06']
    });

    expect(failedSearch.firedEventIds).toEqual(expect.arrayContaining([
      'EV_FAIL_I01', 'EV_FAIL_I02', 'EV_FIND_I03', 'EV_FAIL_I04', 'EV_FAIL_I06'
    ]));
    expect(failedSearch.progress.clueStates).toEqual(expect.objectContaining({
      I01: 'discovered', I02: 'discovered', I03: 'discovered', I04: 'discovered', I06: 'discovered'
    }));
    expect(failedSearch.progress.knownFactIds).toContain('F05');
    expect(failedSearch.progress.knownFactIds).not.toContain('F06');
  });

  it('activates only the required finale objective until a route is selected', () => {
    let progress = reachFinale();

    expect(getActiveScenarioBeat(progress)?.id).toBe('B06');
    expect(progress.objectiveStates.O06).toBe('active');
    expect(progress.objectiveStates.O07).toBe('locked');
    expect(progress.objectiveStates.O08).toBe('locked');

    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    expect(progress.objectiveStates.O06).toBe('completed');
    expect(progress.objectiveStates.O07).toBe('locked');
    expect(progress.objectiveStates.O08).toBe('active');
  });

  it('keeps finale routes mutually exclusive after the first choice', () => {
    let negotiation = reachFinale();
    negotiation = apply(negotiation, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    const rejectedCombat = apply(negotiation, 'S05', 6, { events: ['EV_CHOOSE_COMBAT'] });
    expect(rejectedCombat.firedEventIds).not.toContain('EV_CHOOSE_COMBAT');
    expect(rejectedCombat.progress.variables.finaleRoute).toBe('negotiation');
    expect(rejectedCombat.progress.encounters.ENC01.state).toBe('inactive');

    let combat = reachFinale();
    combat = apply(combat, 'S05', 5, { events: ['EV_CHOOSE_COMBAT'] }).progress;
    const rejectedNegotiation = apply(combat, 'S05', 6, { events: ['EV_CHOOSE_NEGOTIATION'] });
    expect(rejectedNegotiation.firedEventIds).not.toContain('EV_CHOOSE_NEGOTIATION');
    expect(rejectedNegotiation.progress.variables.finaleRoute).toBe('combat');
    expect(rejectedNegotiation.progress.encounters.ENC01.state).toBe('active');
  });

  it('fails forward from a missed listen into an extreme persuasion check', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    progress.idleTurns = 2;
    const requested = apply(progress, 'S05', 6, {
      events: ['EV_NEGOTIATION_LISTEN'], completeTurn: false
    });
    const failed = apply(requested.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_LISTEN', outcome: 'fail' }
    });
    expect(failed.firedEventIds).toContain('EV_NEGOTIATION_LISTEN_FAILED');
    expect(failed.progress.knownFactIds).toContain('F13');
    expect(failed.requestedCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_PERSUADE',
      difficulty: '极难'
    }));
    expect(failed.progress.variables.finaleRoute).toBe('negotiation');
  });

  it('fires stable once events idempotently', () => {
    let progress = createScenarioProgress();
    const first = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] });
    expect(first.firedEventIds).toContain('EV_ACCEPT_COMMISSION');
    progress = first.progress;
    const retried = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'], completeTurn: false });
    expect(retried.firedEventIds).not.toContain('EV_ACCEPT_COMMISSION');
    expect(retried.progress.firedEventIds.filter((id) => id === 'EV_ACCEPT_COMMISSION')).toHaveLength(1);
  });

  it('advances nominal 1920 world time without timezone drift', () => {
    const progress = createScenarioProgress();
    const first = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] });
    expect(first.progress.worldTime).toBe('1920-07-13T17:35');
    const second = apply(first.progress, 'S01', 2);
    expect(second.progress.worldTime).toBe('1920-07-13T17:40');
  });

  it('executes S04 entrance effects once but requires an authored map search to unlock the port', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_DISCOVER_I04', 'EV_FIND_I04'] }).progress;
    const entered = apply(progress, 'S04', 3, { previousScene: 'S01' });
    expect(entered.firedEventIds).toContain('EV_S04_FOG');
    expect(entered.firedEventIds).not.toContain('EV_S04_MAP');
    expect(entered.deltas).toContainEqual({ field: 'san', target: 'party', value: -1 });
    expect(entered.progress.knownFactIds).not.toContain('F09');
    expect(getAvailableSceneExits(entered.progress, 'S04').map((exit) => exit.sceneId)).not.toContain('S05');

    const searched = apply(entered.progress, 'S04', 4, { events: ['EV_S04_MAP'] });
    expect(searched.progress.knownFactIds).toContain('F09');
    expect(getAvailableSceneExits(searched.progress, 'S04').map((exit) => exit.sceneId)).toContain('S05');

    const reentered = apply(searched.progress, 'S04', 5, { previousScene: 'S03' });
    expect(reentered.firedEventIds).not.toContain('EV_S04_FOG');
    expect(reentered.deltas.filter((delta) => delta.field === 'san')).toEqual([]);
  });

  it('settles every event eligible at scene entry even if an earlier event completes the beat', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_DISCOVER_I04', 'EV_FIND_I04'] }).progress;
    progress.variables.metMontreal = true;
    progress.worldTime = '1920-07-13T19:00';

    const entered = apply(progress, 'S04', 3, { previousScene: 'S01' });

    expect(entered.firedEventIds).toEqual(expect.arrayContaining([
      'EV_S04_FOG',
      'EV_S04_THUGS'
    ]));
    expect(entered.firedEventIds).not.toContain('EV_S04_MAP');
    expect(entered.progress.encounters.ENC02.state).toBe('resolved');
  });

  it('issues a soft prompt at three idle turns and fail-forwards at six', () => {
    let progress = createScenarioProgress();
    let result = apply(progress, 'S01', 1);
    progress = result.progress;
    result = apply(progress, 'S01', 2);
    progress = result.progress;
    result = apply(progress, 'S01', 3);
    expect(result.softPrompt).toContain('伊莎贝拉');
    progress = result.progress;
    progress = apply(progress, 'S01', 4).progress;
    progress = apply(progress, 'S01', 5).progress;
    result = apply(progress, 'S01', 6);
    expect(result.firedEventIds).toContain('EV_OPENING_RECOVERY');
    expect(result.progress.variables.commissionAccepted).toBe(true);
    expect(result.progress.idleTurns).toBe(0);
  });

  it('recovers a destroyed critical pharmacy clue without a dead end', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_DISCOVER_I04', 'EV_FIND_I04'] }).progress;
    progress.clueStates.I07 = 'destroyed';
    const recovered = apply(progress, 'S04', 3, { previousScene: 'S01' });
    expect(recovered.progress.knownFactIds).toContain('F09');
    expect(recovered.progress.beatStates.B06).toBe('active');
  });

  it('resolves combat victory only after four successful structured attacks', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_COMBAT'] }).progress;
    expect(progress.clocks.fusangEscape.value).toBe(0);
    expect(progress.encounters.ENC01.round).toBe(0);
    expect(progress.variables.combatRoundStarted).toBe(true);
    const clockBeforeAttack = progress.clocks.fusangEscape.value;
    const attack = apply(progress, 'S05', 6, { events: ['EV_COMBAT_ATTACK'] });
    expect(attack.requestedCheck?.scenarioCheckId).toBe('CHECK_COMBAT');
    expect(attack.progress.clocks.fusangEscape.value).toBe(clockBeforeAttack);
    progress = attack.progress;
    for (let hit = 1; hit <= 4; hit += 1) {
      const resolved = apply(progress, 'S05', 6 + hit, {
        completeTurn: false,
        check: { id: 'CHECK_COMBAT', outcome: 'success' }
      });
      progress = resolved.progress;
      expect(progress.encounters.ENC01.opponentHp).toBe(44 - hit * 11);
    }
    const victory = { progress, deltas: [] };
    expect(victory.progress.endingId).toBe('END_A');
    expect(victory.progress.encounters.ENC01.state).toBe('won');
    expect(victory.progress.encounters.ENC01.defeated).toBe(4);
    const loadedAgain = apply(victory.progress, 'S05', 7, { completeTurn: false });
    expect(loadedAgain.deltas).toEqual([]);
  });

  it('reaches escape ending B when the seven-round clock expires', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_COMBAT'] }).progress;
    progress.variables.combatRoundStarted = true;
    for (let turn = 6; turn <= 12; turn += 1) progress = apply(progress, 'S05', turn).progress;
    expect(progress.clocks.fusangEscape.value).toBe(7);
    expect(progress.clocks.fusangEscape.active).toBe(false);
    expect(progress.endingId).toBe('END_B');
    expect(progress.encounters.ENC01.state).toBe('lost');
  });

  it('chains listening and persuasion from resolved checks before ending C', () => {
    let progress = reachFinale();
    progress.beatStates.B03 = 'active';
    progress.objectiveStates.O03 = 'active';
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    const worldTimeBefore = progress.worldTime;
    const listen = apply(progress, 'S05', 6, { events: ['EV_NEGOTIATION_LISTEN'] });
    expect(listen.requestedCheck?.scenarioCheckId).toBe('CHECK_LISTEN');
    expect(listen.progress.worldTime).toBe(worldTimeBefore);
    const understood = apply(listen.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_LISTEN', outcome: 'success' }
    });
    expect(understood.requestedCheck?.scenarioCheckId).toBe('CHECK_PERSUADE');
    expect(understood.progress.knownFactIds).toContain('F13');
    expect(understood.progress.endingId).toBeNull();
    const success = apply(understood.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_PERSUADE', outcome: 'hard' }
    });
    expect(success.progress.endingId).toBe('END_C');
    expect(success.progress.variables.ericRescued).toBe(true);
    expect(success.progress.beatStates.B03).toBe('failed');
    expect(success.progress.objectiveStates.O03).toBe('failed');
    expect(success.progress.activeActId).toBe('A03');
  });

  it('ends with escape ending B when the final persuasion fails', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    const listen = apply(progress, 'S05', 6, { events: ['EV_NEGOTIATION_LISTEN'] });
    const understood = apply(listen.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_LISTEN', outcome: 'success' }
    });
    const failed = apply(understood.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_PERSUADE', outcome: 'fail' }
    });

    expect(failed.firedEventIds).toContain('EV_NEGOTIATION_FAILED');
    expect(failed.progress.objectiveStates.O08).toBe('failed');
    expect(failed.progress.endingId).toBe('END_B');
  });

  it('hides unfinished optional objectives after their act has passed', () => {
    const progress = reachFinale();
    progress.beatStates.B03 = 'active';
    progress.objectiveStates.O03 = 'active';
    expect(getVisibleScenarioObjectives(progress).map((objective) => objective.id)).not.toContain('O03');
    expect(getVisibleScenarioObjectives(progress).map((objective) => objective.id)).toContain('O06');
  });

  it('rejects corrupted ids and malformed clocks in a current v8 save', () => {
    const valid = createScenarioProgress();
    expect(() => hydrateScenarioProgress({ ...valid, endingId: 'END_UNKNOWN' }, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 0
    })).toThrow(/结局|ending/i);
    expect(() => hydrateScenarioProgress({
      ...valid,
      clocks: { fusangEscape: { value: 'seven', active: true, visible: true } }
    }, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 0
    })).toThrow(/时钟|clock/i);
  });

  it('migrates old S04 saves without replaying entry SAN or rewards', () => {
    const migrated = migrateLegacyScenarioProgress({
      currentScene: 'S04', clueIds: ['I04'], flags: {}, turn: 12
    });
    expect(migrated.beatStates.B05).toBe('active');
    expect(migrated.firedEventIds).not.toContain('EV_S04_FOG');
    expect(migrated.settledEndingIds).toEqual([]);
    expect(migrated.migrationLog[0]).toContain('未补发');
  });

  it('rejects an unversioned content-hash mismatch', () => {
    const current = createScenarioProgress();
    expect(() => hydrateScenarioProgress(
      { ...current, contentHash: 'stale-content' },
      { currentScene: 'S01', clueIds: [], flags: {}, turn: 0 }
    )).toThrow(ScenarioContentMismatchError);
  });

  it('migrates the previous v8 content hash without losing progress', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.0.0';
    previous.contentHash = '75b8bb187c4dace1';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'active';
    previous.objectiveStates.O01 = 'locked';
    previous.objectiveStates.O02 = 'locked';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 3
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B02).toBe('active');
    expect(migrated.objectiveStates.O01).toBe('completed');
    expect(migrated.objectiveStates.O02).toBe('active');
    expect(migrated.migrationLog.at(-1)).toContain('1.0.0 -> 1.1.15');
  });

  it('migrates the immediately previous scenario content version', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.12';
    previous.contentHash = '0380e1c1fe9fa566';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'active';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 3
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B02).toBe('active');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.12 -> 1.1.15');
  });

  it('migrates the 1.1.13 live-play save without losing its current scene', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.13';
    previous.contentHash = '494364d4cfda2ab2';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'completed';
    previous.beatStates.B04 = 'active';
    previous.knownFactIds = ['F05'];
    previous.visitedSceneIds = ['S01', 'S02', 'S03'];

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S03', clueIds: ['I02', 'I04'], flags: {}, turn: 11
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.visitedSceneIds).toEqual(['S01', 'S02', 'S03']);
    expect(migrated.knownFactIds).toContain('F05');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.13 -> 1.1.15');
  });

  it('migrates the 1.1.9 live-play content version without losing progress', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.9';
    previous.contentHash = '56bbdc8889d15bd1';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'active';
    previous.firedEventIds = ['EV_ACCEPT_COMMISSION'];

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 2
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B02).toBe('active');
    expect(migrated.firedEventIds).toContain('EV_ACCEPT_COMMISSION');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.9 -> 1.1.15');
  });

  it('migrates the 1.1.10 live-play content version without replaying S04 entry effects', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.10';
    previous.contentHash = '3acb27b69a49d649';
    previous.activeActId = 'A02';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'completed';
    previous.beatStates.B05 = 'active';
    previous.objectiveStates.O05 = 'active';
    previous.firedEventIds = ['EV_ACCEPT_COMMISSION', 'EV_S04_FOG'];
    previous.visitedSceneIds = ['S01', 'S03', 'S04'];

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S04', clueIds: [], flags: {}, turn: 8
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B05).toBe('active');
    expect(migrated.firedEventIds.filter((id) => id === 'EV_S04_FOG')).toHaveLength(1);
    expect(migrated.migrationLog.at(-1)).toContain('1.1.10 -> 1.1.15');
  });

  it('restores the combat round consumed by selecting the route in 1.1.6', () => {
    const previous = reachFinale();
    previous.moduleVersion = '1.1.6';
    previous.contentHash = '6204fadbf9c5cf3f';
    previous.variables.finaleRoute = 'combat';
    previous.objectiveStates.O06 = 'completed';
    previous.objectiveStates.O07 = 'active';
    previous.encounters.ENC01.state = 'active';
    previous.encounters.ENC01.route = 'combat';
    previous.encounters.ENC01.round = 1;
    previous.clocks.fusangEscape = { value: 1, active: true, visible: true };

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S05', clueIds: ['I04', 'I07'], flags: {}, turn: 12
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.clocks.fusangEscape.value).toBe(0);
    expect(migrated.encounters.ENC01.round).toBe(0);
    expect(migrated.variables.combatRoundStarted).toBe(false);
    expect(migrated.migrationLog).toContainEqual(expect.stringContaining('恢复完整七个战斗回合'));
  });

  it('migrates a live 1.1.5 pharmacy save and restores the skipped map search', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.5';
    previous.contentHash = '4d651496e9200891';
    previous.activeActId = 'A03';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'completed';
    previous.beatStates.B05 = 'completed';
    previous.beatStates.B06 = 'active';
    previous.objectiveStates.O05 = 'completed';
    previous.objectiveStates.O06 = 'active';
    previous.clueStates.I07 = 'analyzed';
    previous.knownFactIds.push('F09');
    previous.firedEventIds.push('EV_S04_MAP', 'EV_S04_THUGS');
    previous.encounters.ENC02.state = 'active';
    previous.visitedSceneIds.push('S04');

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S04', clueIds: ['I07'], flags: {}, turn: 9
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.clueStates.I07).toBe('unknown');
    expect(migrated.knownFactIds).not.toContain('F09');
    expect(migrated.firedEventIds).not.toContain('EV_S04_MAP');
    expect(migrated.beatStates.B05).toBe('active');
    expect(migrated.beatStates.B06).toBe('locked');
    expect(migrated.encounters.ENC02.state).toBe('resolved');
    expect(migrated.migrationLog).toEqual(expect.arrayContaining([
      expect.stringContaining('自动授予的地图')
    ]));
  });

  it('migrates saves from the pre-fix 1.1.0 runtime', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.0';
    previous.contentHash = '2f9f28cd2a887698';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 1
    });

    expect(migrated.contentHash).not.toBe(previous.contentHash);
    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.0 -> 1.1.15');
  });

  it('migrates saves from the latest 1.1.0 runtime', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.0';
    previous.contentHash = '9aa4d2e09756fc0a';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S05', clueIds: ['I04', 'I07'], flags: {}, turn: 12
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.contentHash).not.toBe(previous.contentHash);
    expect(migrated.migrationLog.at(-1)).toContain('1.1.0 -> 1.1.15');
  });

  it('migrates the saved real-play state from scenario 1.1.1', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.1';
    previous.contentHash = 'df77e2dcefd534f1';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'active';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: [], flags: {}, turn: 2
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B02).toBe('active');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.1 -> 1.1.15');
  });

  it('migrates the saved real-play state from scenario 1.1.2', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.2';
    previous.contentHash = 'f6d2725f8d274d21';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'completed';
    previous.clueStates.I04 = 'discovered';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S01', clueIds: ['I04'], flags: {}, turn: 3
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.clueStates.I04).toBe('discovered');
    expect(migrated.knownFactIds).not.toContain('F06');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.2 -> 1.1.15');
  });

  it('migrates the saved real-play state from scenario 1.1.4', () => {
    const previous = createScenarioProgress();
    previous.moduleVersion = '1.1.4';
    previous.contentHash = 'a30bd9e43e729d45';
    previous.beatStates.B01 = 'completed';
    previous.beatStates.B02 = 'completed';
    previous.beatStates.B05 = 'completed';
    previous.beatStates.B06 = 'active';
    previous.objectiveStates.O06 = 'completed';
    previous.objectiveStates.O08 = 'active';
    previous.variables.finaleRoute = 'negotiation';

    const migrated = hydrateScenarioProgress(previous, {
      currentScene: 'S05', clueIds: ['I04', 'I07'], flags: {}, turn: 24
    });

    expect(migrated.moduleVersion).toBe('1.1.15');
    expect(migrated.beatStates.B06).toBe('active');
    expect(migrated.objectiveStates.O08).toBe('active');
    expect(migrated.variables.finaleRoute).toBe('negotiation');
    expect(migrated.migrationLog.at(-1)).toContain('1.1.4 -> 1.1.15');
  });
});
