export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderConfigError';
  }
}

export class AiProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProtocolError';
  }
}

export class AiResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseFormatError';
  }
}

export class AiConnectionError extends Error {
  constructor(readonly cause: unknown) {
    super('未能取得模型服务响应，请检查网络、代理及 AI 设置中的服务地址，恢复连接后重试本轮。');
    this.name = 'AiConnectionError';
  }
}

export class AiHttpError extends Error {
  constructor(readonly status: number, detail?: string) {
    const hint = aiHttpHint(status);
    super(`HTTP ${status}：${hint}${detail ? ` ${detail.slice(0, 240)}` : ''}`);
    this.name = 'AiHttpError';
  }
}

export function aiHttpHint(status: number): string {
  return status === 401 ? '认证失败，请检查 API Key。'
      : status === 403 ? '访问被拒绝，请检查账号和模型权限。'
      : status === 429 ? '请求受限，请检查服务额度或稍后重试。'
      : status >= 500 ? '模型服务暂时异常，请稍后重试。'
      : '模型服务拒绝了请求，请检查 AI 设置。';
}
