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

export function isAiProviderRuntimeError(error: unknown): boolean {
  return error instanceof AiProviderConfigError || error instanceof AiProtocolError;
}
