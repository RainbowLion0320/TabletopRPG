import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollD100 } from '../../src/services/dice';
import type { CheckRequest } from '../../src/types/game';

afterEach(() => {
  vi.restoreAllMocks();
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
