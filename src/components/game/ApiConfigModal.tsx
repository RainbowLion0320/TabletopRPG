import { useEffect, useState } from 'react';
import type { ApiConfig } from '../../types/game';
import { readApiConfig } from '../../services/storage';

interface ApiConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ApiConfig) => void;
}

export function ApiConfigModal({ onClose, onSave, open }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>({ provider: 'openai', apiKey: '', endpoint: '', model: 'gpt-4o' });

  useEffect(() => {
    if (open) {
      setConfig(readApiConfig() ?? { provider: 'openai', apiKey: '', endpoint: '', model: 'gpt-4o' });
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>AI DM 配置</h2>
        <p>API Key 仅保存在本地浏览器。正式多人版建议迁移到服务端代理。</p>
        <label>
          提供商
          <select
            value={config.provider}
            onChange={(event) => setConfig((current) => ({ ...current, provider: event.target.value as ApiConfig['provider'] }))}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="mimo">小米 MiMo</option>
            <option value="custom">自定义端点</option>
          </select>
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
        {config.provider === 'custom' ? (
          <label>
            端点
            <input
              value={config.endpoint ?? ''}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setConfig((current) => ({ ...current, endpoint: event.target.value }))}
            />
          </label>
        ) : null}
        <footer>
          <button className="ghost-btn" onClick={onClose}>取消</button>
          <button className="primary-btn" onClick={() => onSave(config)}>保存</button>
        </footer>
      </div>
    </div>
  );
}
