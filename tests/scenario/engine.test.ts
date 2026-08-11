import { describe, expect, it } from 'vitest';
import {
  createScenarioProgress,
  getActiveScenarioBeat,
  getAvailableSceneExits,
  getAvailableStoryEvents,
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
  progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I04'] }).progress;
  progress = apply(progress, 'S04', 3, { previousScene: 'S01' }).progress;
  progress = apply(progress, 'S05', 4, { previousScene: 'S04' }).progress;
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

  it('keeps unfired manual clue events available after their beat completes', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I02'] }).progress;

    expect(progress.beatStates.B02).toBe('completed');
    expect(progress.objectiveStates.O02).toBe('completed');
    expect(getAvailableStoryEvents(progress, 'S01').map((event) => event.id)).toContain('EV_FIND_I04');

    progress = apply(progress, 'S01', 3, { events: ['EV_FIND_I04'] }).progress;
    expect(progress.clueStates.I04).toBe('analyzed');
    expect(progress.knownFactIds).toContain('F06');
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

  it('executes S04 entrance effects once and unlocks the port', () => {
    let progress = createScenarioProgress();
    progress = apply(progress, 'S01', 1, { events: ['EV_ACCEPT_COMMISSION'] }).progress;
    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I04'] }).progress;
    const entered = apply(progress, 'S04', 3, { previousScene: 'S01' });
    expect(entered.firedEventIds).toEqual(expect.arrayContaining(['EV_S04_FOG', 'EV_S04_MAP']));
    expect(entered.deltas).toContainEqual({ field: 'san', target: 'party', value: -1 });
    expect(entered.progress.knownFactIds).toContain('F09');
    expect(getAvailableSceneExits(entered.progress, 'S04').map((exit) => exit.sceneId)).toContain('S05');

    const reentered = apply(entered.progress, 'S04', 5, { previousScene: 'S03' });
    expect(reentered.firedEventIds).not.toEqual(expect.arrayContaining(['EV_S04_FOG', 'EV_S04_MAP']));
    expect(reentered.deltas.filter((delta) => delta.field === 'san')).toEqual([]);
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
    progress = apply(progress, 'S01', 2, { events: ['EV_FIND_I04'] }).progress;
    progress.clueStates.I07 = 'destroyed';
    const recovered = apply(progress, 'S04', 3, { previousScene: 'S01' });
    expect(recovered.progress.knownFactIds).toContain('F09');
    expect(recovered.progress.beatStates.B06).toBe('active');
  });

  it('reaches combat victory ending A and settles rewards only once', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_COMBAT'] }).progress;
    const victory = apply(progress, 'S05', 6, { events: ['EV_COMBAT_WIN'] });
    expect(victory.progress.endingId).toBe('END_A');
    expect(victory.deltas).toEqual(expect.arrayContaining([
      { field: 'san', target: 'party', value: 1 },
      { field: 'money', target: 'party', value: 200 },
      { field: 'mythos', target: 'party', value: 1 }
    ]));
    const loadedAgain = apply(victory.progress, 'S05', 7, { completeTurn: false });
    expect(loadedAgain.deltas).toEqual([]);
  });

  it('reaches escape ending B when the seven-round clock expires', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_COMBAT'] }).progress;
    for (let turn = 6; turn <= 11; turn += 1) progress = apply(progress, 'S05', turn).progress;
    expect(progress.clocks.fusangEscape.value).toBe(7);
    expect(progress.endingId).toBe('END_B');
    expect(progress.encounters.ENC01.state).toBe('lost');
  });

  it('requires listening and persuasion before ending C', () => {
    let progress = reachFinale();
    progress = apply(progress, 'S05', 5, { events: ['EV_CHOOSE_NEGOTIATION'] }).progress;
    const listen = apply(progress, 'S05', 6, { events: ['EV_NEGOTIATION_LISTEN'], completeTurn: false });
    expect(listen.requestedCheck?.scenarioCheckId).toBe('CHECK_LISTEN');
    progress = apply(listen.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_LISTEN', outcome: 'success' }
    }).progress;
    const understood = apply(progress, 'S05', 6, { events: ['EV_NEGOTIATION_UNDERSTOOD'], completeTurn: false });
    expect(understood.requestedCheck?.scenarioCheckId).toBe('CHECK_PERSUADE');
    expect(understood.progress.endingId).toBeNull();
    progress = apply(understood.progress, 'S05', 6, {
      completeTurn: false,
      check: { id: 'CHECK_PERSUADE', outcome: 'hard' }
    }).progress;
    const success = apply(progress, 'S05', 7, { events: ['EV_NEGOTIATION_SUCCESS'] });
    expect(success.progress.endingId).toBe('END_C');
    expect(success.progress.variables.ericRescued).toBe(true);
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

    expect(migrated.moduleVersion).toBe('1.0.1');
    expect(migrated.beatStates.B02).toBe('active');
    expect(migrated.objectiveStates.O01).toBe('completed');
    expect(migrated.objectiveStates.O02).toBe('active');
    expect(migrated.migrationLog.at(-1)).toContain('1.0.0 -> 1.0.1');
  });
});
