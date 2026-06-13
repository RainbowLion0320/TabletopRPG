import { useEffect, useState } from 'react';
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
  onSave: (config: ApiConfig) => void;
}

export function ApiConfigModal({ onClose, onSave, open }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>(() => readApiConfig() ?? getEnvDefaultApiConfig());
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Prefer saved config, otherwise pre-fill from VITE_AI_* env vars so the user
      // can see what defaults will be applied without re-entering them every time.
      setConfig(readApiConfig() ?? getEnvDefaultApiConfig());
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const updateProvider = (provider: AiProvider) => {
    setConfig((current) => normalizeApiConfig({
      ...current,
      provider,
      protocol: defaultProtocolForProvider(provider),
      endpoint: defaultEndpointForProvider(provider) || current.endpoint || '',
      model: defaultModelForProvider(provider) || current.model || ''
    }));
  };

  const save = () => {
    const normalized = normalizeApiConfig(config);
    const validation = getApiConfigValidationError(normalized);
    if (validation) {
      setError(validation);
      return;
    }
    onSave(normalized);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>AI DM 配置</h2>
        <p>保存后会同时写入本地浏览器与项目根目录的 <code>.env.local</code>（已 gitignore），下次启动自动生效。</p>
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
        <footer>
          <button className="ghost-btn" onClick={onClose}>取消</button>
          <button className="primary-btn" onClick={save}>保存</button>
        </footer>
      </div>
    </div>
  );
}
