import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'fs';
import path from 'path';

const ENV_KEYS = ['VITE_AI_PROVIDER', 'VITE_AI_API_KEY', 'VITE_AI_MODEL', 'VITE_AI_ENDPOINT'] as const;
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
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk as Buffer));
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
              provider?: string;
              apiKey?: string;
              model?: string;
              endpoint?: string;
            };
            const incoming: Partial<Record<EnvKey, string>> = {
              VITE_AI_PROVIDER: (body.provider ?? '').trim(),
              VITE_AI_API_KEY: (body.apiKey ?? '').trim(),
              VITE_AI_MODEL: (body.model ?? '').trim(),
              VITE_AI_ENDPOINT: (body.endpoint ?? '').trim()
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
  let existing: Record<string, string> = {};
  try {
    const content = await fs.readFile(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      existing[key] = value;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Apply incoming. Empty string => delete that key (lets the user "unset" via UI).
  for (const key of ENV_KEYS) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value && value.length > 0) existing[key] = value;
    else delete existing[key];
  }

  // Stable serialization: managed keys first, then preserve any other pre-existing keys.
  const managed = ENV_KEYS.filter((k) => existing[k] !== undefined).map((k) => `${k}=${existing[k]}`);
  const others = Object.entries(existing)
    .filter(([k]) => !ENV_KEYS.includes(k as EnvKey))
    .map(([k, v]) => `${k}=${v}`);
  const out = [
    '# Auto-managed by TabletopRPG. Local-only; ignored by git.',
    ...managed,
    ...others
  ].join('\n') + '\n';

  await fs.writeFile(envPath, out, 'utf8');
}

export default defineConfig({
  plugins: [react(), envWriterPlugin()],
  server: {
    port: 5273,
    strictPort: false
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
