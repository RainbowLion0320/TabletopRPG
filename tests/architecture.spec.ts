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

test('AI model integration is isolated behind provider adapters', async () => {
  const dmBusinessFiles = [
    'src/dm/narrator.ts',
    'src/dm/summarizer.ts',
    'src/dm/caseBoardSynthesizer.ts',
    'src/dm/memory/factExtractor.ts',
    'src/dm/memory/system2Synthesizer.ts'
  ];

  const businessSources = await Promise.all(
    dmBusinessFiles.map(async (file) => `${file}\n${await readSource(file)}`)
  );
  const businessJoined = businessSources.join('\n\n');

  expect(businessJoined).not.toContain('fetch(');
  expect(businessJoined).not.toContain('/responses');
  expect(businessJoined).not.toContain('/chat/completions');
  expect(businessJoined).toContain('./llm/client');

  const adapterFiles = [
    'src/dm/llm/responsesAdapter.ts',
    'src/dm/llm/chatCompletionsAdapter.ts'
  ];
  const adapterSources = await Promise.all(
    adapterFiles.map(async (file) => `${file}\n${await readSource(file)}`)
  );
  const adapterJoined = adapterSources.join('\n\n');

  expect(adapterJoined).toContain('/responses');
  expect(adapterJoined).toContain('/chat/completions');
});

test('dynamic case board and background update contracts remain wired end to end', async () => {
  const gameTypes = await readSource('src/types/game.ts');
  const reducer = await readSource('src/state/gameReducer.ts');
  const pipeline = await readSource('src/dm/pipeline.ts');

  expect(gameTypes).toContain('caseBoard?: CaseBoardState');
  expect(reducer).toContain("type: 'applyCaseBoardPatch'");
  expect(pipeline).toContain('synthesizeCaseBoardPatch');
  expect(pipeline).toContain('backgroundUpdate');
  expect(pipeline).not.toContain('deferredUpdates');
});

test('narrative rich text stays in the safe markup pipeline', async () => {
  const narrator = await readSource('src/dm/narrator.ts');
  const reducer = await readSource('src/state/gameReducer.ts');
  const panel = await readSource('src/components/game/NarrativePanel.tsx');
  const markup = await readSource('src/services/narrativeMarkup.ts');
  const combined = `${panel}\n${markup}`;

  expect(narrator).toContain('normalizeNarrativeKeywordHints');
  expect(reducer).toContain('keywords: response.keywords?.length');
  expect(panel).toContain('markNarrativeText');
  expect(combined).not.toContain('dangerouslySetInnerHTML');
  expect(combined).not.toContain('marked(');
  expect(combined).not.toContain('ReactMarkdown');
});
