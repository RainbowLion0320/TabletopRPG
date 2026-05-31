import { useEffect, useState } from 'react';
import { getEnvDefaultApiConfig, readApiConfig } from '../../services/storage';
import type { ApiConfig } from '../../types/game';

interface ApiConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ApiConfig) => void;
}

export function ApiConfigModal({ onClose, onSave, open }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>(() => readApiConfig() ?? getEnvDefaultApiConfig());

  useEffect(() => {
    if (open) {
      // Prefer saved config, otherwise pre-fill from VITE_AI_* env vars so the user
      // can see what defaults will be applied without re-entering them every time.
      setConfig(readApiConfig() ?? getEnvDefaultApiConfig());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>AI DM 配置</h2>
        <p>保存后会同时写入本地浏览器与项目根目录的 <code>.env.local</code>（已 gitignore），下次启动自动生效。</p>
        <label>
          提供商
          <select
            value={config.provider}
            onChange={(event) => setConfig((current) => ({ ...current, provider: event.target.value as ApiConfig['provider'] }))}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="mimo">小米 MiMo Token Plan（OpenAI 兼容）</option>
            <option value="custom">自定义 OpenAI 兼容端点</option>
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
        {config.provider === 'custom' || config.provider === 'mimo' ? (
          <label>
            端点 (Base URL)
            <input
              value={config.endpoint ?? ''}
              placeholder={config.provider === 'mimo'
                ? 'https://token-plan-cn.xiaomimimo.com/v1'
                : 'https://api.example.com/v1'}
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

