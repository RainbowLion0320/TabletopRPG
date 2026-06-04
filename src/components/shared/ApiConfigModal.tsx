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
        <footer>
          <button className="ghost-btn" onClick={onClose}>取消</button>
          <button className="primary-btn" onClick={() => onSave(config)}>保存</button>
        </footer>
      </div>
    </div>
  );
}

