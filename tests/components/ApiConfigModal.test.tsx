import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConfigModal } from '../../src/components/shared/ApiConfigModal';

describe('ApiConfigModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('contains keyboard focus and restores the opener on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { rerender } = render(<ApiConfigModal open onClose={onClose} onSave={() => undefined} />);
    expect(screen.getByLabelText('Provider')).toHaveFocus();
    screen.getByRole('button', { name: '保存' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.getByLabelText('Provider')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<ApiConfigModal open={false} onClose={onClose} onSave={() => undefined} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('keeps the modal open and explains a storage failure', async () => {
    render(<ApiConfigModal open onClose={() => undefined} onSave={async () => { throw new Error('quota'); }} />);
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/保存失败，浏览器存储不可用/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('clears OpenAI endpoint and model when switching to MiMo', () => {
    const onSave = vi.fn();
    render(<ApiConfigModal open onClose={() => undefined} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'mimo' } });

    expect(screen.getByLabelText('协议')).toHaveValue('chat-completions');
    expect(screen.getByLabelText('Endpoint')).toHaveValue('');
    expect(screen.getByLabelText('模型')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText(/必须配置 endpoint/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
