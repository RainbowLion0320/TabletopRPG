import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiConfigModal } from '../../src/components/shared/ApiConfigModal';

describe('ApiConfigModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clears OpenAI endpoint and model when switching to MiMo', () => {
    const onSave = vi.fn();
    render(<ApiConfigModal open onClose={() => undefined} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'mimo' } });

    expect(screen.getByLabelText('协议')).toHaveValue('chat-completions');
    expect(screen.getByLabelText('Endpoint')).toHaveValue('');
    expect(screen.getByLabelText('模型')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText(/必须配置 endpoint/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
