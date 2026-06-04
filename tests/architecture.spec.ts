import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

async function readSource(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('app shell delegates game orchestration to focused app modules', async () => {
  const appSource = await readSource('src/app/App.tsx');

  expect(appSource).toContain('./GameScreen');
  expect(appSource).toContain('./useGameController');
  expect(appSource).not.toContain('../components/game/');
  expect(appSource).not.toContain('../services/aiDm');
  expect(appSource).not.toContain('../services/dice');
  expect(appSource).not.toContain('../services/storage');
  expect(appSource).not.toContain('useReducer');
  expect(appSource.split(/\r?\n/).length).toBeLessThanOrEqual(130);
});

test('game controller owns AI, dice, save, and action-flow dependencies', async () => {
  const controllerSource = await readSource('src/app/useGameController.ts');

  expect(controllerSource).toContain('../services/aiDm');
  expect(controllerSource).toContain('../services/dice');
  expect(controllerSource).toContain('../services/storage');
  expect(controllerSource).toContain('submitAction');
  expect(controllerSource).toContain('handleRoll');
  expect(controllerSource).toContain('saveCurrentGame');
});

test('AI model integration uses Responses API only', async () => {
  const files = [
    'src/dm/narrator.ts',
    'src/dm/tools.ts',
    'src/dm/summarizer.ts',
    'src/dm/memory/factExtractor.ts',
    'src/dm/memory/system2Synthesizer.ts',
    'tests/dm/pipeline-memory.test.ts'
  ];

  const sources = await Promise.all(files.map(async (file) => `${file}\n${await readSource(file)}`));
  const joined = sources.join('\n\n');

  expect(joined).not.toContain('chat/completions');
  expect(joined).not.toContain('chat.completions');
  expect(joined).not.toContain('response_format');
  expect(joined).not.toContain('tool_calls');
  expect(joined).not.toContain('choices:');
  expect(joined).not.toContain('parseToolCalls');
});
