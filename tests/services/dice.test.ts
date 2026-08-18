import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueueCheck, rollD100 } from '../../src/services/dice';
import type { CheckRequest } from '../../src/types/game';
import { makeInvestigator } from '../dm/fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('D100 authored check queues', () => {
  it('keeps the same authored check id when different investigators own separate rolls', () => {
    const players = [
      makeInvestigator({ name: '亨利' }, { '格斗（拳）': 55 }),
      makeInvestigator({ name: '罗伯特' }, { '射击（手枪）': 65 })
    ];
    const current = enqueueCheck(null, {
      scenarioCheckId: 'CHECK_COMBAT',
      player: '亨利',
      skill: '格斗（拳）',
      difficulty: '普通'
    }, players);

    const queued = enqueueCheck(current, {
      scenarioCheckId: 'CHECK_COMBAT',
      player: '罗伯特',
      skill: '射击（手枪）',
      difficulty: '普通'
    }, players);

    expect(queued.queuedChecks).toEqual([
      expect.objectContaining({
        scenarioCheckId: 'CHECK_COMBAT',
        player: '罗伯特',
        skill: '射击（手枪）',
        threshold: 65
      })
    ]);
  });
});

describe('D100 difficulty resolution', () => {
  const hardCheck: CheckRequest = {
    player: '亨利·格雷',
    skill: '说服',
    difficulty: '困难',
    skillVal: 60,
    threshold: 30
  };

  it('fails a hard check when the roll only meets ordinary skill', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.575);

    expect(rollD100(hardCheck)).toEqual({
      roll: 58,
      level: 'fail',
      label: '失败（58）'
    });
  });

  it('retains the achieved success level after meeting the requested difficulty', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.28);

    expect(rollD100(hardCheck)).toEqual({
      roll: 29,
      level: 'hard',
      label: '困难成功（29）'
    });
  });
});
