/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI 服务提供商：openai | anthropic | mimo | custom，缺省为 mimo */
  readonly VITE_AI_PROVIDER?: string;
  /** AI API Key，从本地 shell 环境变量读取，不会写入仓库 */
  readonly VITE_AI_API_KEY?: string;
  /** 模型名，缺省由 provider 决定（mimo 默认 mimo-v2.5） */
  readonly VITE_AI_MODEL?: string;
  /** 自定义端点，仅 provider=custom 时生效 */
  readonly VITE_AI_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
