import type {} from 'vitest/config';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'fs';
import path from 'path';
import { getApiConfigValidationError, normalizeApiConfig } from './src/config/aiConfig';

export const AI_ENV_KEYS = [
  'VITE_AI_PROVIDER',
  'VITE_AI_PROTOCOL',
  'VITE_AI_ENDPOINT',
  'VITE_AI_API_KEY',
  'VITE_AI_MODEL'
] as const;
const ENV_KEYS = AI_ENV_KEYS;
type EnvKey = (typeof ENV_KEYS)[number];

/**
 * Dev-only middleware that lets the in-game settings panel persist the active
 * AI config into `.env.local` (gitignored) so the next launch picks it up via
 * `import.meta.env.VITE_AI_*` without the user touching ~/.zshrc.
 *
 * - Only mounted in dev (Vite middleware lives on the dev server only).
 * - Merges into the existing `.env.local` instead of overwriting it.
 * - Empty values delete the corresponding key.
 */
function envWriterPlugin(): Plugin {
  return {
    name: 'tabletoprpg-env-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__api_config', (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!isLocalConfigRequest(req.headers)) {
          res.statusCode = 403;
          res.end('Only same-origin JSON configuration requests are allowed.');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16_384) {
            if (!res.writableEnded) { res.statusCode = 413; res.end('Configuration is too large.'); }
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', async () => {
          if (res.writableEnded) return;
          try {
            const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
              res.statusCode = 400; res.end('Invalid configuration.'); return;
            }
            const body = normalizeApiConfig(payload);
            if (getApiConfigValidationError(body)) {
              res.statusCode = 400; res.end('Invalid configuration.'); return;
            }
            const incoming: Partial<Record<EnvKey, string>> = {
              VITE_AI_PROVIDER: (body.provider ?? '').trim(),
              VITE_AI_PROTOCOL: (body.protocol ?? '').trim(),
              VITE_AI_ENDPOINT: (body.endpoint ?? '').trim(),
              VITE_AI_API_KEY: (body.apiKey ?? '').trim(),
              VITE_AI_MODEL: (body.model ?? '').trim()
            };
            await mergeEnvLocal(incoming);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            // eslint-disable-next-line no-console
            console.log('[env-writer] .env.local updated by ApiConfigModal');
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
          }
        });
      });
    }
  };
}

async function mergeEnvLocal(incoming: Partial<Record<EnvKey, string>>) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  await fs.writeFile(envPath, updateEnvLocalContent(content, incoming), 'utf8');
}

export function isLocalConfigRequest(headers: Record<string, string | string[] | undefined>): boolean {
  if (typeof headers['content-type'] !== 'string' || !/^application\/json(?:\s*;|\s*$)/i.test(headers['content-type'])) return false;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  if (!headers.origin) return true; // Non-browser local tooling.
  try {
    const origin = new URL(String(headers.origin));
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === headers.host;
  } catch { return false; }
}

export function updateEnvLocalContent(content: string, incoming: Partial<Record<EnvKey, string>>): string {
  const lines = content.split(/\r?\n/).filter((line) => {
    const key = /^\s*(?:export\s+)?([\w]+)\s*=/.exec(line)?.[1];
    return !key || !ENV_KEYS.includes(key as EnvKey) || !(key in incoming);
  });
  while (lines[lines.length - 1] === '') lines.pop();
  for (const key of ENV_KEYS) {
    const value = incoming[key];
    if (!value) continue;
    if (/[\r\n]/.test(value)) throw new Error('Configuration values must be single-line.');
    const quote = ['"', "'", '`'].find((candidate) => !value.includes(candidate));
    if (!quote) throw new Error('Configuration contains unsupported quoting.');
    // dotenv-expand otherwise interprets dollar signs inside credentials.
    lines.push(`${key}=${quote}${value.replace(/\$/g, '\\$')}${quote}`);
  }
  return `${lines.join('\n')}\n`;
}

export function mergeEnvValues(
  existing: Record<string, string>,
  incoming: Partial<Record<EnvKey, string>>
): Record<string, string> {
  const merged = { ...existing };
  for (const key of ENV_KEYS) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value && value.length > 0) merged[key] = value;
    else delete merged[key];
  }
  return merged;
}

export default defineConfig({
  plugins: [react(), envWriterPlugin()],
  server: {
    port: 5273,
    strictPort: false,
    // Settings apply immediately from localStorage. Restarting on the app's
    // own env write would reload the page and discard the current game.
    watch: { ignored: ['**/.env.local'] }
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'es2020',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/smoke/**', 'node_modules', 'dist']
  }
});
