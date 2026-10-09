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

  it.each([{ isComposing: true }, { keyCode: 229 }])('preserves an edited connection when Escape cancels composition (%j)', (composition) => {
    const onClose = vi.fn();
    render(<ApiConfigModal open onClose={onClose} onSave={vi.fn()} />);
    const key = screen.getByLabelText('API Key');
    const model = screen.getByLabelText('模型');
    fireEvent.change(key, { target: { value: 'test-key-draft' } });
    fireEvent.change(model, { target: { value: '待确认的模型' } });
    model.focus();
    expect(fireEvent.keyDown(model, { key: 'Escape', ...composition })).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(model).toHaveFocus();
    expect(model).toHaveValue('待确认的模型');
    expect(key).toHaveValue('test-key-draft');
    fireEvent.keyDown(model, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
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
    expect(screen.getByRole('alert')).toHaveTextContent('请填写服务地址');
    expect(screen.getByLabelText('服务地址（Endpoint）')).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('points a missing model back to its own field and clears its accessible error after editing', () => {
    const onSave = vi.fn();
    render(<ApiConfigModal open onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-key' } });
    fireEvent.change(screen.getByLabelText('服务地址（Endpoint）'), { target: { value: 'https://gateway.example/v1' } });
    screen.getByRole('button', { name: '保存' }).focus();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    const model = screen.getByLabelText('模型');
    expect(model).toHaveFocus();
    expect(model).toHaveAttribute('aria-invalid', 'true');
    expect(model).toHaveAccessibleDescription('请填写模型名。');
    expect(model.closest('.api-field')).toContainElement(screen.getByRole('alert'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(model, { target: { value: 'gateway-model' } });
    expect(model).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens a collapsed connection and focuses an invalid endpoint without discarding other inputs', () => {
    window.localStorage.setItem('trpg-api', JSON.stringify({ provider: 'custom', protocol: 'responses', endpoint: 'bad-address', apiKey: 'test-key', model: 'gateway-model' }));
    const onSave = vi.fn();
    render(<ApiConfigModal open onClose={vi.fn()} onSave={onSave} />);
    const connection = screen.getByText('连接设置').closest('details')!;
    connection.open = false; fireEvent(connection, new Event('toggle'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(connection).toHaveAttribute('open');
    const endpoint = screen.getByLabelText('服务地址（Endpoint）');
    expect(endpoint).toHaveFocus();
    expect(endpoint).toHaveAttribute('aria-invalid', 'true');
    expect(endpoint.closest('.api-field')).toContainElement(screen.getByRole('alert'));
    expect(screen.getByLabelText('模型')).toHaveValue('gateway-model');
    expect(screen.getByLabelText('API Key')).toHaveValue('test-key');
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
