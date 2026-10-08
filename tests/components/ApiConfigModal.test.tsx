import { act, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: '关闭 AI DM 配置' })).toHaveFocus();
    screen.getByRole('button', { name: '保存' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭 AI DM 配置' })).toHaveFocus();
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

    fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'mimo' } });

    expect(screen.getByLabelText('协议')).toHaveValue('chat-completions');
    expect(screen.getByLabelText('服务地址（Endpoint）')).toHaveValue('');
    expect(screen.getByLabelText('模型')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText(/必须配置 endpoint/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts a fresh configuration without an error, validates on save, and clears stale feedback on edit', () => {
    const onSave = vi.fn();
    render(<ApiConfigModal open onClose={vi.fn()} onSave={onSave} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('连接设置').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入 API Key');
    expect(screen.getByLabelText('API Key')).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows saved gateway settings without changing their protocol or endpoint', () => {
    window.localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'openai', protocol: 'chat-completions', endpoint: 'https://gateway.example/v1', apiKey: 'test-key', model: 'gateway-model'
    }));
    render(<ApiConfigModal open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('连接设置').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('协议')).toHaveValue('chat-completions');
    expect(screen.getByLabelText('服务地址（Endpoint）')).toHaveValue('https://gateway.example/v1');
    expect(screen.getByLabelText('模型')).toHaveValue('gateway-model');
  });

  it('masks the key by default and resets the reveal state when reopened', () => {
    const props = { onClose: vi.fn(), onSave: vi.fn() };
    const { rerender } = render(<ApiConfigModal open {...props} />);
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');
    rerender(<ApiConfigModal open={false} {...props} />);
    rerender(<ApiConfigModal open {...props} />);
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });

  it('freezes editing and dismissal during a real asynchronous save and prevents duplicate writes', async () => {
    let rejectSave!: (reason: Error) => void;
    const onSave = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const onClose = vi.fn();
    render(<ApiConfigModal open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    const dialog = screen.getByRole('dialog', { name: 'AI DM 配置' });
    fireEvent.submit(dialog);
    fireEvent.submit(dialog);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('API Key')).toBeDisabled();
    expect(screen.getByLabelText('服务商')).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭 AI DM 配置' })).toBeDisabled();
    await act(async () => rejectSave(new Error('disk full')));
    expect(screen.getByLabelText('API Key')).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
