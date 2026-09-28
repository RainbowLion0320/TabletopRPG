import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { usingNativeStorage } from '../../platform/storage';
import {
  defaultEndpointForProvider,
  defaultModelForProvider,
  defaultProtocolForProvider,
  getApiConfigValidationError,
  normalizeApiConfig
} from '../../config/aiConfig';
import { getEnvDefaultApiConfig, readApiConfig } from '../../services/storage';
import type { AiProtocol, AiProvider, ApiConfig } from '../../types/game';

interface ApiConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ApiConfig) => void | Promise<void>;
}

export function ApiConfigModal({ onClose, onSave, open }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>(() => readApiConfig() ?? getEnvDefaultApiConfig());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);

  useEffect(() => {
    if (open) {
      // Prefer saved config, otherwise pre-fill from VITE_AI_* env vars so the user
      // can see what defaults will be applied without re-entering them every time.
      const initial = readApiConfig() ?? getEnvDefaultApiConfig();
      setConfig(initial);
      setError(getApiConfigValidationError(initial) ?? '');
    }
  }, [open]);

  if (!open) return null;

  const updateProvider = (provider: AiProvider) => {
    setConfig((current) => normalizeApiConfig({
      ...current,
      provider,
      protocol: defaultProtocolForProvider(provider),
      endpoint: defaultEndpointForProvider(provider),
      model: defaultModelForProvider(provider)
    }));
  };

  const save = async () => {
    if (saving) return;
    const normalized = normalizeApiConfig(config);
    const validation = getApiConfigValidationError(normalized);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
    } catch {
      setError(usingNativeStorage() ? '保存失败，本机存储不可用或空间不足，请检查后重试。' : '保存失败，浏览器存储不可用或空间不足，请检查后重试。');
    } finally {
      setSaving(false);
    }
  };

  const titleId = 'api-config-modal-title';

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} tabIndex={-1} className="modal-card api-config-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>AI DM 配置</h2>
        <p>{usingNativeStorage() ? '设置加密保存在本机，下次打开自动生效。' : '设置保存在当前浏览器，下次打开自动生效。'}</p>
        <div className="api-config-fields">
        <label>
          Provider
          <select
            value={config.provider}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="mimo">MiMo</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          协议
          <select
            value={config.protocol}
            onChange={(event) => setConfig((current) => ({
              ...current,
              protocol: event.target.value as AiProtocol
            }))}
          >
            <option value="responses">OpenAI Responses</option>
            <option value="chat-completions">Chat Completions compatible</option>
          </select>
        </label>
        <label>
          Endpoint
          <input
            value={config.endpoint ?? ''}
            placeholder={config.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://your-gateway.example/v1'}
            onChange={(event) => setConfig((current) => ({ ...current, endpoint: event.target.value }))}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={config.apiKey}
            placeholder="sk-..."
            onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
          />
        </label>
        <label>
          模型
          <input
            value={config.model ?? ''}
            placeholder="gpt-4o"
            onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
          />
        </label>
        {error ? <p className="modal-error">{error}</p> : null}
        </div>
        <footer>
          <button className="ghost-btn" disabled={saving} onClick={onClose}>取消</button>
          <button className="primary-btn" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
        </footer>
      </div>
    </div>
  );
}
