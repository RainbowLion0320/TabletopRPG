import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';
import { TuningDialArt } from './TuningDialArt';
import { usingNativeStorage } from '../../platform/storage';
import {
  defaultEndpointForProvider,
  defaultModelForProvider,
  defaultProtocolForProvider,
  getApiConfigValidationIssue,
  normalizeApiConfig,
  type ApiConfigField
} from '../../config/aiConfig';
import { getEnvDefaultApiConfig, readApiConfig } from '../../services/storage';
import type { AiProtocol, AiProvider, ApiConfig } from '../../types/game';
import './api-config.css';

interface ApiConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ApiConfig) => void | Promise<void>;
}

export function ApiConfigModal({ onClose, onSave, open }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>(() => readApiConfig() ?? getEnvDefaultApiConfig());
  const [feedback, setFeedback] = useState<{ field: ApiConfigField | null; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const feedbackFocus = useRef<ApiConfigField | 'storage' | null>(null);
  const close = () => { if (!savingRef.current) onClose(); };
  useDialogFocus(open, dialogRef, close, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar, .ending-actions button')
  });

  useEffect(() => {
    if (open) {
      // Prefer saved config, otherwise pre-fill from VITE_AI_* env vars so the user
      // can see what defaults will be applied without re-entering them every time.
      const initial = readApiConfig() ?? getEnvDefaultApiConfig();
      setConfig(initial);
      // A fresh form is an invitation to configure, not a failed submission.
      // Previously saved incomplete connections still explain what needs repair.
      setFeedback(initial.apiKey ? getApiConfigValidationIssue(initial) : null);
      feedbackFocus.current = null;
      setConnectionOpen(hasCustomConnection(initial));
      setKeyVisible(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    const target = feedbackFocus.current;
    const dialog = dialogRef.current;
    if (!open || !dialog || !target) return;
    feedbackFocus.current = null;
    const inputId = { apiKey: 'api-key', model: 'api-model', endpoint: 'api-endpoint', storage: 'api-config-error' }[target];
    const element = dialog.querySelector<HTMLElement>(`#${inputId}`);
    const body = dialog.querySelector<HTMLElement>('.api-config-fields');
    if (!element || !body) return;
    if (target !== 'storage') element.focus({ preventScroll: true });
    revealField(element, body);
  }, [open, feedback, connectionOpen]);

  useEffect(() => {
    const body = dialogRef.current?.querySelector<HTMLElement>('.api-config-fields');
    if (!open || !body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches('input, select') && body.contains(active)) revealField(active, body);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const updateProvider = (provider: AiProvider) => {
    setFeedback(null);
    setConnectionOpen(provider !== 'openai');
    setConfig((current) => normalizeApiConfig({
      ...current,
      provider,
      protocol: defaultProtocolForProvider(provider),
      endpoint: defaultEndpointForProvider(provider),
      model: defaultModelForProvider(provider)
    }));
  };

  const update = (patch: Partial<ApiConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setFeedback(null);
  };

  const save = async () => {
    if (savingRef.current) return;
    const normalized = normalizeApiConfig(config);
    const validation = getApiConfigValidationIssue(normalized);
    if (validation) {
      feedbackFocus.current = validation.field;
      setFeedback(validation);
      if (validation.field === 'endpoint') setConnectionOpen(true);
      return;
    }
    savingRef.current = true;
    setFeedback(null);
    setSaving(true);
    try {
      await onSave(normalized);
    } catch {
      feedbackFocus.current = 'storage';
      setFeedback({ field: null, message: usingNativeStorage() ? '保存失败，本机存储不可用或空间不足，请检查后重试。' : '保存失败，浏览器存储不可用或空间不足，请检查后重试。' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const titleId = 'api-config-modal-title';
  const errorFor = (field: ApiConfigField | null) => feedback?.field === field
    ? <p id="api-config-error" className="api-field-error" role="alert">{feedback.message}</p> : null;
  const invalid = (field: ApiConfigField) => ({
    'aria-invalid': feedback?.field === field || undefined,
    'aria-describedby': feedback?.field === field ? 'api-config-error' : undefined
  });

  return (
    <div className="modal-backdrop api-config-backdrop">
      <form ref={dialogRef} noValidate tabIndex={-1} className="modal-card api-config-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={saving}
        onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <header className="api-config-header">
          <h2 id={titleId}><TuningDialArt size={24} />AI DM 配置</h2>
          <button type="button" className="ghost-btn api-config-close" aria-label="关闭 AI DM 配置" disabled={saving} onClick={close}><X size={20} aria-hidden="true" /></button>
        </header>
        <p className="api-storage-note">{usingNativeStorage() ? '设置加密保存在本机，下次打开自动生效。' : '设置保存在当前浏览器，下次打开自动生效。'}</p>
        <div className="api-config-fields">
        <fieldset className="api-config-controls" disabled={saving}>
        <div className="api-field">
          <label htmlFor="api-provider">服务商</label>
          <div className="api-select">
          <select
            id="api-provider"
            value={config.provider}
            onChange={(event) => updateProvider(event.target.value as AiProvider)}
          >
            <option value="openai">OpenAI</option>
            <option value="mimo">MiMo</option>
            <option value="custom">自定义 / 兼容服务</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
          </div>
        </div>
        <div className="api-key-field">
          <label htmlFor="api-key">API Key</label>
          <div className="api-key-control">
          <input
            id="api-key" type={keyVisible ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            {...invalid('apiKey')}
            value={config.apiKey}
            placeholder="粘贴服务商提供的密钥"
            onChange={(event) => update({ apiKey: event.target.value })}
          />
          <button type="button" className="ghost-btn api-key-reveal" aria-label={keyVisible ? '隐藏 API Key' : '显示 API Key'} aria-pressed={keyVisible} onClick={() => setKeyVisible(!keyVisible)}>
            {keyVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
          </div>
          {errorFor('apiKey')}
        </div>
        <div className="api-field">
          <label htmlFor="api-model">模型</label>
          <input
            id="api-model" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            {...invalid('model')}
            value={config.model ?? ''}
            placeholder={config.provider === 'openai' ? 'gpt-4o' : '填写服务商提供的模型名'}
            onChange={(event) => update({ model: event.target.value })}
          />
          {errorFor('model')}
        </div>
        <details className="api-connection" open={connectionOpen} onToggle={(event) => setConnectionOpen(event.currentTarget.open)}>
          <summary><TuningDialArt /><span>连接设置</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="api-connection-fields">
          <div className="api-field">
            <label htmlFor="api-endpoint">服务地址（Endpoint）</label>
            <input id="api-endpoint" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              {...invalid('endpoint')}
              value={config.endpoint ?? ''}
              placeholder={config.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://your-gateway.example/v1'}
              onChange={(event) => update({ endpoint: event.target.value })} />
            {errorFor('endpoint')}
          </div>
          <div className="api-field">
            <label htmlFor="api-protocol">协议</label>
            <div className="api-select">
            <select id="api-protocol" value={config.protocol} onChange={(event) => update({ protocol: event.target.value as AiProtocol })}>
              <option value="responses">OpenAI Responses</option>
              <option value="chat-completions">Chat Completions compatible</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          </div>
        </details>
        </fieldset>
        {errorFor(null)}
        </div>
        <footer>
          <button type="button" className="ghost-btn" disabled={saving} onClick={close}>取消</button>
          <button type="submit" className="primary-btn" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        </footer>
      </form>
    </div>
  );
}

/** Scroll only the field body; leave the dialog header, footer and game reading alone. */
function revealField(element: HTMLElement, body: HTMLElement) {
  const bounds = body.getBoundingClientRect();
  const group = element.closest<HTMLElement>('.api-field, .api-key-field');
  const rect = group && group.getBoundingClientRect().height <= bounds.height - 8
    ? group.getBoundingClientRect() : element.getBoundingClientRect();
  if (rect.bottom > bounds.bottom - 4) body.scrollTop += rect.bottom - bounds.bottom + 4;
  else if (rect.top < bounds.top + 4) body.scrollTop += rect.top - bounds.top - 4;
}

function hasCustomConnection(config: ApiConfig) {
  return config.provider !== 'openai'
    || config.protocol !== defaultProtocolForProvider('openai')
    || config.endpoint?.replace(/\/+$/, '') !== defaultEndpointForProvider('openai');
}
