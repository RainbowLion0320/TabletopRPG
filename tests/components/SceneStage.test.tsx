import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneStage } from '../../src/components/game/SceneStage';
import { storyData } from '../../src/data/storyData';
import { makeState } from '../dm/fixtures';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('scene transitions', () => {
  it('waits for each initial image before starting its entrance', () => {
    const { container } = render(<SceneStage state={makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' })} />);
    const painting = container.querySelector<HTMLImageElement>('.scene-backdrop-img')!;
    const portrait = container.querySelector<HTMLImageElement>('.scene-npc')!;
    expect(painting).toHaveClass('scene-image-loading');
    expect(portrait).toHaveClass('scene-image-loading');
    act(() => vi.advanceTimersByTime(1000));
    expect(portrait).not.toHaveClass('scene-image-arriving');
    fireEvent.load(painting);
    expect(painting).toHaveClass('scene-image-arriving');
    expect(portrait).toHaveClass('scene-image-loading');
    fireEvent.load(portrait);
    expect(portrait).toHaveClass('scene-image-arriving');
    expect(portrait).not.toHaveClass('scene-image-loading');
  });

  it('does not reuse the previous portrait readiness when the authored NPC changes', () => {
    const { container, rerender } = render(<SceneStage state={makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' })} />);
    fireEvent.load(container.querySelector('.scene-npc')!);
    rerender(<SceneStage state={makeState({ currentScene: 'S02', activeNpcName: storyData.scenes.S02.npcs[0] })} />);
    const next = container.querySelector('.scene-npc')!;
    expect(next).toHaveClass('scene-image-loading');
    expect(next).not.toHaveClass('scene-image-arriving');
    fireEvent.load(next);
    expect(next).toHaveClass('scene-image-arriving');
  });

  it('hides failed artwork without adding a broken image or changing the scene layout', () => {
    const { container } = render(<SceneStage state={makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' })} />);
    fireEvent.error(container.querySelector('.scene-npc')!);
    fireEvent.error(container.querySelector('.scene-backdrop-img')!);
    expect(container.querySelector('.scene-npc')).toBeNull();
    expect(container.querySelector('.scene-backdrop-img')).toBeNull();
    expect(container.querySelector('.scene-stage')).toBeInTheDocument();
    expect(container.querySelector('.scene-shade')).toBeInTheDocument();
  });

  it('can load an initially failed scene again when revisiting it', () => {
    const { container, rerender } = render(<SceneStage state={makeState({ currentScene: 'S01' })} />);
    fireEvent.error(container.querySelector('.scene-backdrop-img')!);
    rerender(<SceneStage state={makeState({ currentScene: 'S02' })} />);
    fireEvent.load(container.querySelector('.scene-backdrop-img')!);
    rerender(<SceneStage state={makeState({ currentScene: 'S01' })} />);
    const picture = container.querySelector('.scene-backdrop-img')!;
    expect(picture).toHaveClass('scene-image-loading');
    fireEvent.load(picture);
    expect(picture).toHaveClass('scene-image-arriving');
  });

  it('never renders an NPC portrait outside its authored scene', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '洛夫·蒙特利尔' });
    const { container } = render(<SceneStage state={state} />);
    expect(container.querySelector('.scene-backdrop-img')?.getAttribute('src')).toBe(storyData.scenes.S01.image);
    expect(container.querySelector('.scene-npc')).toBeNull();
  });

  it('keeps the decoded painting during loading and releases it after the new painting fades in', () => {
    const { container, rerender, unmount } = render(<SceneStage state={makeState({ currentScene: 'S01' })} />);
    const picture = () => container.querySelector<HTMLImageElement>('.scene-backdrop-img')!;
    const previous = picture().src;
    fireEvent.load(picture());
    rerender(<SceneStage state={makeState({ currentScene: 'S02' })} />);
    expect(container.querySelector<HTMLImageElement>('.scene-backdrop-retiring')?.src).toBe(previous);
    expect(picture()).toHaveClass('scene-image-loading');
    fireEvent.load(picture());
    expect(picture()).toHaveClass('scene-image-arriving');
    act(() => vi.advanceTimersByTime(280));
    expect(container.querySelector('.scene-backdrop-retiring')).toBeNull();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retain a false scene after a rapid change or failed incoming picture', () => {
    const { container, rerender, unmount } = render(<SceneStage state={makeState({ currentScene: 'S01' })} />);
    const picture = () => container.querySelector<HTMLImageElement>('.scene-backdrop-img')!;
    const previous = picture().src;
    fireEvent.load(picture());
    rerender(<SceneStage state={makeState({ currentScene: 'S02' })} />);
    rerender(<SceneStage state={makeState({ currentScene: 'S03' })} />);
    expect(container.querySelector<HTMLImageElement>('.scene-backdrop-retiring')?.src).toBe(previous);
    expect(container.querySelectorAll('.scene-backdrop-img')).toHaveLength(1);
    fireEvent.error(picture());
    expect(container.querySelector('.scene-backdrop-retiring')).toBeNull();
    expect(container.querySelector('.scene-backdrop-img')).toBeNull();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the old picture immediately for reduced motion and cancels unfinished cleanup on unmount', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const { container, rerender, unmount } = render(<SceneStage state={makeState({ currentScene: 'S01' })} />);
    const picture = () => container.querySelector<HTMLImageElement>('.scene-backdrop-img')!;
    fireEvent.load(picture());
    rerender(<SceneStage state={makeState({ currentScene: 'S02' })} />);
    fireEvent.load(picture());
    act(() => vi.advanceTimersByTime(0));
    expect(container.querySelector('.scene-backdrop-retiring')).toBeNull();
    rerender(<SceneStage state={makeState({ currentScene: 'S03' })} />);
    fireEvent.load(picture());
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
