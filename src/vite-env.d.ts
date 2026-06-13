/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** AI provider id. Defaults to openai when empty. */
  readonly VITE_AI_PROVIDER?: string;
  /** AI wire protocol. Defaults from provider when empty. */
  readonly VITE_AI_PROTOCOL?: string;
  /** AI endpoint base URL, for custom gateways. */
  readonly VITE_AI_ENDPOINT?: string;
  /** OpenAI API key, read from the local shell or .env.local. */
  readonly VITE_AI_API_KEY?: string;
  /** AI model name. Defaults to gpt-4o for OpenAI when empty. */
  readonly VITE_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
