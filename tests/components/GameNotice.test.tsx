import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GameNotice } from '../../src/components/game/GameNotice';

it('keeps one live region through new feedback and removes expired text', () => {
  const { rerender } = render(<GameNotice message="" />);
  const status = screen.getByRole('status');
  expect(status).toBeEmptyDOMElement();
  expect(status).toHaveAttribute('aria-live', 'polite');
  expect(status).toHaveAttribute('aria-atomic', 'true');
  rerender(<GameNotice message="已保存" />);
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toHaveTextContent('已保存');
  rerender(<GameNotice message="未能保存，请检查设备存储空间后重试。" />);
  expect(screen.getByRole('status')).toBe(status);
  expect(status).not.toHaveTextContent('已保存');
  expect(status).toHaveTextContent('未能保存，请检查设备存储空间后重试。');
  rerender(<GameNotice message="" />);
  expect(status).toBeEmptyDOMElement();
});
