import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioSettingsButton } from '../../src/components/shared/AudioSettingsButton';
import { gameAudio } from '../../src/audio/audio';
import { defaultAudioSettings, loadAudioSettings } from '../../src/audio/settings';

beforeEach(() => {
  gameAudio.updateSettings(defaultAudioSettings);
  vi.spyOn(gameAudio, 'unlock').mockImplementation(() => undefined);
  vi.spyOn(gameAudio, 'play').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

it('announces volume percentages, preserves both volumes while muted and previews only enabled effects', () => {
  render(<AudioSettingsButton iconOnly />);
  fireEvent.click(screen.getByRole('button', { name: '声音设置', exact: true }));
  const dialog = within(screen.getByRole('dialog', { name: '声音设置' }));
  const music = dialog.getByRole('slider', { name: '音乐音量' });
  const effects = dialog.getByRole('slider', { name: '音效音量' });
  const preview = dialog.getByRole('button', { name: '试听骰子音效' });
  expect(dialog.getByLabelText('音乐音量', { selector: 'input' })).toBe(music);
  expect(music).toHaveAttribute('aria-valuetext', '30%');
  fireEvent.change(music, { target: { value: '37' } });
  expect(music).toHaveAttribute('aria-valuetext', '37%');
  fireEvent.click(dialog.getByRole('switch', { name: '背景音乐' }));
  expect(music).toBeDisabled(); expect(effects).toBeEnabled();
  expect(loadAudioSettings()).toMatchObject({ musicEnabled: false, musicVolume: .37, effectsEnabled: true });
  fireEvent.change(effects, { target: { value: '0' } });
  expect(preview).toBeDisabled(); fireEvent.click(preview); expect(gameAudio.play).not.toHaveBeenCalled();
  fireEvent.change(effects, { target: { value: '23' } }); fireEvent.click(preview);
  expect(gameAudio.play).toHaveBeenCalledExactlyOnceWith('diceLand');
  fireEvent.click(dialog.getByRole('switch', { name: '游戏音效' }));
  expect(effects).toBeDisabled(); expect(preview).toBeDisabled();
  fireEvent.click(dialog.getByRole('switch', { name: '背景音乐' }));
  expect(music).toBeEnabled(); expect(music).toHaveValue('37');
  expect(loadAudioSettings()).toEqual({ musicEnabled: true, musicVolume: .37, effectsEnabled: false, effectsVolume: .23 });
});

it('keeps source and license credits on demand and returns to the sound entry without losing preferences', () => {
  render(<AudioSettingsButton iconOnly />);
  const entry = screen.getByRole('button', { name: '声音设置', exact: true }); entry.focus(); fireEvent.click(entry);
  expect(screen.getByRole('button', { name: '关闭声音设置' })).toHaveFocus();
  const credits = screen.getByRole('button', { name: '音乐与音效鸣谢', exact: true });
  const content = document.getElementById(credits.getAttribute('aria-controls')!)!;
  expect(credits).toHaveAttribute('aria-expanded', 'false');
  expect(content).toHaveAttribute('inert'); expect(content).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('link', { name: 'Kevin MacLeod' })).toBeNull();
  fireEvent.click(credits);
  expect(credits).toHaveAttribute('aria-expanded', 'true');
  expect(content).not.toHaveAttribute('inert'); expect(content).not.toHaveAttribute('aria-hidden');
  for (const name of ['Kevin MacLeod', 'CC BY 4.0', 'Kenney', 'CC0']) expect(screen.getByRole('link', { name, exact: true })).toBeVisible();
  expect(screen.getByText(/Darkest Child/)).toHaveTextContent('已剪辑、调整响度并制作循环。');
  fireEvent.change(screen.getByRole('slider', { name: '音乐音量' }), { target: { value: '0' } });
  fireEvent.keyDown(document, { key: 'Escape' }); expect(entry).toHaveFocus();
  expect(screen.queryByRole('dialog')).toBeNull(); fireEvent.click(entry);
  expect(screen.getByRole('slider', { name: '音乐音量' })).toHaveValue('0');
  const reopenedCredits = screen.getByRole('button', { name: '音乐与音效鸣谢', exact: true });
  expect(reopenedCredits).toHaveAttribute('aria-expanded', 'false');
  const reopenedContent = document.getElementById(reopenedCredits.getAttribute('aria-controls')!)!;
  expect(reopenedContent).toHaveAttribute('inert'); expect(reopenedContent).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('link', { name: 'Kevin MacLeod' })).toBeNull();
  expect(loadAudioSettings().musicVolume).toBe(0);
});
