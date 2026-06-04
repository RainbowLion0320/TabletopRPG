/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenAI API key, read from the local shell or .env.local. */
  readonly VITE_AI_API_KEY?: string;
  /** OpenAI model name. Defaults to gpt-4o when empty. */
  readonly VITE_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
