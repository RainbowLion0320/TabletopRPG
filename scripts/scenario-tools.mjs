#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { compile as compileTypes } from 'json-schema-to-typescript';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_ID = 'wuzhongxiaoshi';
const SOURCE_DIR = join(ROOT, 'scenarios', SCENARIO_ID);
const SCHEMA_PATH = join(ROOT, 'scenarios', 'schema', 'scenario.schema.json');
const RUNTIME_PATH = join(ROOT, 'src', 'data', 'scenarios', SCENARIO_ID, 'runtime.generated.ts');
const TYPES_PATH = join(ROOT, 'src', 'scenario', 'generated', 'scenario-schema.d.ts');
const DOC_PATH = join(ROOT, 'docs', 'scenarios', `${SCENARIO_ID}.md`);
const SCHEMA_DOC_PATH = join(ROOT, 'docs', 'scenarios', 'schema-reference.md');
const AUTHOR_GUIDE_PATH = join(ROOT, 'docs', 'scenarios', 'authoring-guide.md');
const MIGRATION_DOC_PATH = join(ROOT, 'docs', 'scenarios', 'save-migration.md');
const SOURCE_FILES = ['manifest', 'world', 'progression', 'rules', 'presentation'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readYaml(name) {
  return parseYaml(readFileSync(join(SOURCE_DIR, `${name}.yaml`), 'utf8'));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function moduleHash(module) {
  return createHash('sha256').update(stableStringify(module)).digest('hex').slice(0, 16);
}

function collectIds(items, label, errors) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`${label} 存在重复 id：${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function conditionRefs(condition, visit) {
  if (!condition || typeof condition !== 'object') return;
  if (Array.isArray(condition.all)) condition.all.forEach((item) => conditionRefs(item, visit));
  if (Array.isArray(condition.any)) condition.any.forEach((item) => conditionRefs(item, visit));
  if (condition.not) conditionRefs(condition.not, visit);
  for (const key of ['sceneIs', 'sceneVisited', 'factKnown', 'eventFired']) {
    if (condition[key]) visit(key, condition[key]);
  }
  for (const key of ['beat', 'objective', 'clue', 'variable', 'clock', 'check', 'encounter']) {
    if (condition[key]) visit(key, condition[key]);
  }
}

function effectRefs(effect, visit) {
  const fields = [
    'activateBeat', 'completeBeat', 'failBeat', 'activateObjective', 'completeObjective',
    'failObjective', 'revealFact', 'discoverClue', 'analyzeClue', 'destroyClue',
    'setVariable', 'startClock', 'tickClock', 'stopClock', 'requestCheck',
    'startEncounter', 'updateEncounter', 'resolveEncounter', 'setEnding'
  ];
  for (const field of fields) if (effect[field]) visit(field, effect[field]);
}

function lintModule(module) {
  const errors = [];
  const { manifest, world, progression, rules, presentation } = module;
  const ids = {
    scene: collectIds(world.scenes, 'scenes', errors),
    npc: collectIds(world.npcs, 'npcs', errors),
    encounter: collectIds(world.encounters, 'encounters', errors),
    item: collectIds(world.items, 'items', errors),
    fact: collectIds(world.facts, 'facts', errors),
    variable: collectIds(progression.variables, 'variables', errors),
    act: collectIds(progression.acts, 'acts', errors),
    objective: collectIds(progression.objectives, 'objectives', errors),
    beat: collectIds(progression.beats, 'beats', errors),
    event: collectIds(progression.storyEvents, 'storyEvents', errors),
    ending: collectIds(progression.endings, 'endings', errors),
    rule: collectIds(rules.entries, 'rules', errors),
    clockPresentation: collectIds(presentation.clocks, 'presentation.clocks', errors),
    boardNode: collectIds(presentation.caseBoard.nodes, 'caseBoard.nodes', errors),
    boardEdge: collectIds(presentation.caseBoard.edges, 'caseBoard.edges', errors)
  };
  const allEffects = [
    ...progression.storyEvents.flatMap((event) => event.effects),
    ...progression.endings.flatMap((ending) => ending.effects),
    ...rules.entries.flatMap((rule) => rule.effects)
  ];
  const clocks = new Set(allEffects.flatMap((effect) => effect.startClock ? [effect.startClock] : []));
  const checks = new Set(allEffects.flatMap((effect) => effect.requestCheck ? [effect.requestCheck] : []));

  for (const clockId of clocks) {
    if (!ids.clockPresentation.has(clockId)) errors.push(`clock ${clockId} 缺少 presentation.clocks 公开定义`);
  }
  for (const clockId of ids.clockPresentation) {
    if (!clocks.has(clockId)) errors.push(`presentation.clocks 引用未声明的 clock：${clockId}`);
  }

  const assertRef = (kind, id, source) => {
    const map = {
      sceneIs: ids.scene, sceneVisited: ids.scene, scene: ids.scene,
      beat: ids.beat, activateBeat: ids.beat, completeBeat: ids.beat, failBeat: ids.beat,
      objective: ids.objective, activateObjective: ids.objective, completeObjective: ids.objective, failObjective: ids.objective,
      clue: ids.item, discoverClue: ids.item, analyzeClue: ids.item, destroyClue: ids.item,
      factKnown: ids.fact, revealFact: ids.fact, eventFired: ids.event,
      variable: ids.variable, setVariable: ids.variable,
      encounter: ids.encounter, startEncounter: ids.encounter, updateEncounter: ids.encounter, resolveEncounter: ids.encounter,
      setEnding: ids.ending
    };
    if (kind === 'startClock' || kind === 'requestCheck') return;
    if (kind === 'clock' || kind === 'tickClock' || kind === 'stopClock') {
      if (!clocks.has(id)) errors.push(`${source} 引用未声明的 clock：${id}`);
    } else if (kind === 'check') {
      if (!checks.has(id)) errors.push(`${source} 引用未声明的 check：${id}`);
    } else if (map[kind] && !map[kind].has(id)) errors.push(`${source} 引用不存在的 ${kind}：${id}`);
  };

  if (!ids.scene.has(manifest.startSceneId)) errors.push(`startSceneId 不存在：${manifest.startSceneId}`);
  if (!ids.beat.has(manifest.startBeatId)) errors.push(`startBeatId 不存在：${manifest.startBeatId}`);

  const aliases = new Map();
  for (const entity of [...world.scenes, ...world.npcs, ...world.items]) {
    for (const alias of [entity.name, ...(entity.aliases ?? [])]) {
      const normalized = alias.trim().toLowerCase();
      const owner = aliases.get(normalized);
      if (owner && owner !== entity.id) errors.push(`别名冲突：${alias} 同时属于 ${owner} / ${entity.id}`);
      aliases.set(normalized, entity.id);
    }
  }

  for (const [assetId, assetPath] of Object.entries(manifest.assets)) {
    if (!existsSync(resolve(SOURCE_DIR, assetPath))) errors.push(`资源不存在：${assetId} -> ${assetPath}`);
  }
  const assetIds = new Set(Object.keys(manifest.assets));
  for (const scene of world.scenes) {
    if (!assetIds.has(scene.assetId)) errors.push(`${scene.id} 引用不存在资源 ${scene.assetId}`);
    scene.npcIds.forEach((id) => { if (!ids.npc.has(id)) errors.push(`${scene.id} 引用不存在 NPC ${id}`); });
    scene.itemIds.forEach((id) => { if (!ids.item.has(id)) errors.push(`${scene.id} 引用不存在 item ${id}`); });
    (scene.dmFactIds ?? []).forEach((id) => { if (!ids.fact.has(id)) errors.push(`${scene.id} 引用不存在 fact ${id}`); });
    scene.exits.forEach((exit) => {
      if (!ids.scene.has(exit.to)) errors.push(`${scene.id} 出口指向不存在场景 ${exit.to}`);
      conditionRefs(exit.when, (kind, id) => assertRef(kind, id, `${scene.id}.exit.${exit.to}`));
    });
  }
  for (const npc of world.npcs) {
    if (npc.assetId && !assetIds.has(npc.assetId)) errors.push(`${npc.id} 引用不存在资源 ${npc.assetId}`);
    [...npc.knowledgeFactIds, ...npc.dmFactIds].forEach((id) => { if (!ids.fact.has(id)) errors.push(`${npc.id} 引用不存在 fact ${id}`); });
  }
  for (const item of world.items) {
    if (!ids.scene.has(item.sceneId)) errors.push(`${item.id} 引用不存在场景 ${item.sceneId}`);
    item.factIds.forEach((id) => { if (!ids.fact.has(id)) errors.push(`${item.id} 引用不存在 fact ${id}`); });
    if (!ids.event.has(item.fallbackEventId)) errors.push(`${item.id} 缺少有效 fail-forward event：${item.fallbackEventId}`);
    if (!ids.event.has(item.discovery.successEventId)) errors.push(`${item.id} 缺少有效 successEventId：${item.discovery.successEventId}`);
    if (!ids.event.has(item.discovery.failureEventId)) errors.push(`${item.id} 缺少有效 failureEventId：${item.discovery.failureEventId}`);
  }
  for (const objective of progression.objectives) if (!ids.beat.has(objective.beatId)) errors.push(`${objective.id} 引用不存在 beat ${objective.beatId}`);
  for (const beat of progression.beats) {
    if (!ids.act.has(beat.actId)) errors.push(`${beat.id} 引用不存在 act ${beat.actId}`);
    beat.sceneIds.forEach((id) => { if (!ids.scene.has(id)) errors.push(`${beat.id} 引用不存在 scene ${id}`); });
    beat.objectiveIds.forEach((id) => { if (!ids.objective.has(id)) errors.push(`${beat.id} 引用不存在 objective ${id}`); });
    beat.dmFactIds.forEach((id) => { if (!ids.fact.has(id)) errors.push(`${beat.id} 引用不存在 fact ${id}`); });
    beat.allowedEventIds.forEach((id) => { if (!ids.event.has(id)) errors.push(`${beat.id} 引用不存在 event ${id}`); });
    beat.nextBeatIds.forEach((id) => { if (!ids.beat.has(id)) errors.push(`${beat.id} 引用不存在 next beat ${id}`); });
    if (beat.kind === 'mandatory' && (!beat.recoveryEventId || !ids.event.has(beat.recoveryEventId))) errors.push(`${beat.id} 是必经节点但没有有效 recoveryEventId`);
    conditionRefs(beat.activation, (kind, id) => assertRef(kind, id, `${beat.id}.activation`));
    conditionRefs(beat.completion, (kind, id) => assertRef(kind, id, `${beat.id}.completion`));
  }
  for (const event of progression.storyEvents) {
    if (!ids.beat.has(event.beatId)) errors.push(`${event.id} 引用不存在 beat ${event.beatId}`);
    conditionRefs(event.when, (kind, id) => assertRef(kind, id, `${event.id}.when`));
    event.effects.forEach((effect) => effectRefs(effect, (kind, id) => assertRef(kind, id, `${event.id}.effects`)));
  }
  for (const ending of progression.endings) {
    conditionRefs(ending.when, (kind, id) => assertRef(kind, id, `${ending.id}.when`));
    ending.effects.forEach((effect) => effectRefs(effect, (kind, id) => assertRef(kind, id, `${ending.id}.effects`)));
  }
  for (const rule of rules.entries) {
    conditionRefs(rule.when, (kind, id) => assertRef(kind, id, `${rule.id}.when`));
    rule.effects.forEach((effect) => effectRefs(effect, (kind, id) => assertRef(kind, id, `${rule.id}.effects`)));
  }

  const reachableScenes = new Set([manifest.startSceneId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const scene of world.scenes) {
      if (!reachableScenes.has(scene.id)) continue;
      for (const exit of scene.exits) if (!reachableScenes.has(exit.to)) { reachableScenes.add(exit.to); changed = true; }
    }
  }
  for (const id of ids.scene) if (!reachableScenes.has(id)) errors.push(`场景从开局不可达：${id}`);

  const reachableBeats = new Set([manifest.startBeatId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const beat of progression.beats) {
      if (!reachableBeats.has(beat.id)) continue;
      for (const id of beat.nextBeatIds) if (!reachableBeats.has(id)) { reachableBeats.add(id); changed = true; }
    }
  }
  for (const beat of progression.beats) if (!reachableBeats.has(beat.id)) errors.push(`剧情节点从开局不可达：${beat.id}`);
  if (progression.endings.length < 1) errors.push('至少需要一个结局');

  for (const node of presentation.caseBoard.nodes) conditionRefs(node.when, (kind, id) => assertRef(kind, id, `${node.id}.when`));
  for (const edge of presentation.caseBoard.edges) {
    if (!ids.boardNode.has(edge.from) || !ids.boardNode.has(edge.to)) errors.push(`${edge.id} 引用不存在案件板节点`);
    conditionRefs(edge.when, (kind, id) => assertRef(kind, id, `${edge.id}.when`));
  }
  return errors;
}

function loadAndValidate() {
  const module = Object.fromEntries(SOURCE_FILES.map((name) => [name, readYaml(name)]));
  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(module)) {
    const details = (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`).join('\n');
    throw new Error(`Scenario Schema 校验失败：\n${details}`);
  }
  const lintErrors = lintModule(module);
  if (lintErrors.length) throw new Error(`Scenario 语义校验失败：\n${lintErrors.map((item) => `- ${item}`).join('\n')}`);
  return { module, schema, hash: moduleHash(module) };
}

function toImportPath(fromFile, absoluteTarget) {
  let path = relative(dirname(fromFile), absoluteTarget).split(sep).join('/');
  if (!path.startsWith('.')) path = `./${path}`;
  return path;
}

function runtimeSource(module, hash) {
  const imports = [];
  const entries = [];
  let index = 0;
  for (const [assetId, source] of Object.entries(module.manifest.assets)) {
    const name = `asset${index++}`;
    imports.push(`import ${name} from '${toImportPath(RUNTIME_PATH, resolve(SOURCE_DIR, source))}';`);
    entries.push(`  ${JSON.stringify(assetId)}: ${name}`);
  }
  const serialized = JSON.stringify(module, null, 2);
  return `/* AUTO-GENERATED by npm run scenario:build. DO NOT EDIT. */\nimport type { ScenarioModule } from '../../../scenario/generated/scenario-schema';\n${imports.join('\n')}\n\nexport const scenarioContentHash = ${JSON.stringify(hash)};\nexport const scenarioAssetUrls: Record<string, string> = {\n${entries.join(',\n')}\n};\nexport const generatedScenarioModule = ${serialized} as ScenarioModule;\n`;
}

function moduleDoc(module, hash) {
  const { manifest, world, progression, rules } = module;
  const lines = [
    '<!-- AUTO-GENERATED by npm run scenario:docs. DO NOT EDIT. -->',
    `# 《${manifest.title}》KP 模组手册`, '',
    `- 模组 ID：\`${manifest.id}\``, `- 内容版本：\`${manifest.contentVersion}\``, `- 内容哈希：\`${hash}\``,
    `- 规则：${manifest.system}`, `- 时间：${manifest.era}`, `- 作者：${manifest.authors.join('、')}`, '',
    '## 剧情主干', '',
    ...progression.acts.sort((a, b) => a.order - b.order).flatMap((act) => [
      `### ${act.title}`, '',
      ...progression.beats.filter((beat) => beat.actId === act.id).map((beat) =>
        `- **${beat.id} ${beat.title}**（${beat.kind}）场景：${beat.sceneIds.join('、')}；目标：${beat.objectiveIds.join('、') || '无'}`
      ), ''
    ]),
    '## 剧情图', '', '```mermaid', 'flowchart TD',
    ...progression.beats.flatMap((beat) => beat.nextBeatIds.length
      ? beat.nextBeatIds.map((next) => `  ${beat.id}["${beat.id} ${beat.title}"] --> ${next}`)
      : [`  ${beat.id}["${beat.id} ${beat.title}"]`]),
    ...progression.endings.map((ending) => `  ${progression.beats.at(-1)?.id} --> ${ending.id}["${ending.title}"]`),
    '```', '',
    '## 线索依赖图', '', '```mermaid', 'flowchart LR',
    ...world.items.flatMap((item) => item.factIds.length
      ? item.factIds.map((factId) => `  ${item.id}["${item.id} ${item.name}"] --> ${factId}`)
      : [`  ${item.id}["${item.id} ${item.name}"]`]),
    ...world.scenes.flatMap((scene) => scene.exits.map((exit) => `  ${scene.id} -->|出口| ${exit.to}`)),
    '```', '',
    '## 场景与合法出口', '',
    ...world.scenes.map((scene) => `- **${scene.id} ${scene.name}**：${scene.description} 出口：${scene.exits.map((exit) => `${exit.to}(${exit.travelMinutes}分钟)`).join('、') || '无'}`), '',
    '## 线索与失败推进', '',
    ...world.items.map((item) => `- **${item.id} ${item.name}**：${item.appearance} 检定：${item.discovery.skill}/${item.discovery.difficulty}；失败推进：${item.discovery.failForward}`), '',
    '## 不可变真相', '', ...world.facts.filter((fact) => fact.scope === 'dm').map((fact) => `- **${fact.id}**：${fact.statement}`), '',
    '## 剧情事件', '', ...progression.storyEvents.map((event) => `- **${event.id} ${event.title}** [${event.trigger}${event.once ? '/once' : '/repeatable'}]：${event.narrativeCue}`), '',
    '## 结局', '', ...progression.endings.sort((a, b) => b.priority - a.priority).map((ending) => `- **${ending.title}**：${ending.summary}`), '',
    '## 规则支持矩阵', '', '| ID | 支持模式 | 触发 | 描述 |', '|---|---|---|---|',
    ...rules.entries.map((rule) => `| ${rule.id} | ${rule.support} | ${rule.trigger} | ${rule.description} |`)
  ];
  return `${lines.join('\n')}\n`;
}

function schemaDoc(schema) {
  const defs = schema.$defs ?? {};
  return `<!-- AUTO-GENERATED by npm run scenario:docs. DO NOT EDIT. -->\n# 模组 Schema 字段参考\n\nSchema：\`${schema.$id}\`\n\n## 顶层分区\n\n- \`manifest\`：版本、作者、系统、时间、开局和资源。\n- \`world\`：事实、场景、NPC、遭遇和物品。\n- \`progression\`：幕、节点、目标、事件和结局。\n- \`rules\`：可执行规则与支持模式。\n- \`presentation\`：开场、建议、公开时钟和案件板。\n\n## 定义索引\n\n${Object.keys(defs).sort().map((key) => `- \`${key}\``).join('\n')}\n`;
}

function authorGuide() {
  return [
    '<!-- AUTO-GENERATED by npm run scenario:docs. DO NOT EDIT. -->', '# 模组作者指南', '',
    '## 唯一事实源', '',
    '每个模组由 `manifest.yaml`、`world.yaml`、`progression.yaml`、`rules.yaml`、`presentation.yaml` 组成。人工只编辑 YAML；`runtime.generated.ts`、类型声明和本文档均由工具生成。', '',
    '## 稳定 ID', '',
    '- 场景、NPC、物品、事实、幕、节点、目标、事件、遭遇和结局必须使用稳定 ID。',
    '- 显示名称和别名可修改，但不得作为存档主键。',
    '- 删除或改名已发布 ID 时必须提高内容版本并提供模组迁移函数。', '',
    '## 剧情建模', '',
    '- `world.facts` 分离 DM 真相与玩家事实；进入场景不等于发现事实。',
    '- `progression.beats` 定义硬主线，`storyEvents` 是唯一权威剧情效果入口。',
    '- 每个运行时时钟都必须在 `presentation.clocks` 声明玩家可见名称和最大值，UI 不显示内部 ID。',
    '- 必经节点必须配置 3 回合软提示、6 回合 fail-forward 和有效 `recoveryEventId`。',
    '- 关键线索必须配置 `fallbackEventId`，任何检定失败或物证损坏后仍须存在合法主线路径。',
    '- YAML 中禁止 JavaScript；Condition/Effect 只能使用 Schema 声明的无脚本 DSL。', '',
    '## 工作流', '',
    '1. 编辑五个 YAML 文件与静态资源清单。',
    '2. 运行 `npm run scenario:validate` 检查 Schema、引用、别名、资源和可达性。',
    '3. 运行 `npm run scenario:generate` 更新运行时、类型和文档。',
    '4. 运行 `npm run scenario:check && npm test && npm run build`。', '',
    '未知字段会直接报错；生成文件禁止手改。', ''
  ].join('\n');
}

function migrationDoc(module, hash) {
  return [
    '<!-- AUTO-GENERATED by npm run scenario:docs. DO NOT EDIT. -->', '# 模组存档迁移说明', '',
    `当前存档格式：\`v8\`。当前内容：\`${module.manifest.id}@${module.manifest.contentVersion}#${hash}\`。`, '',
    '## v1-v7 到 v8', '',
    '- 根据当前场景、已发现物品、旧 flags、场景访问标志和事件日志确定性恢复 `ScenarioProgress`。',
    '- NPC 名称通过显式稳定 ID 映射恢复为 `activeNpcId`。',
    '- S04/S05 旧存档恢复到最远合法节点，不补发入场事件、SAN 损失、遭遇或奖励。',
    '- 无法解释的状态保守落在最近合法节点，并写入 `migrationLog`。', '',
    '## 内容版本', '',
    '存档同时记录 `moduleId`、`moduleVersion` 和 `contentHash`。哈希不匹配且不存在迁移函数时拒绝载入，并输出明确诊断；重复加载不会重放 `once` 事件或结局奖励。', ''
  ].join('\n');
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

async function outputs(module, schema, hash) {
  const types = await compileTypes(schema, 'ScenarioModule', {
    bannerComment: '/* AUTO-GENERATED by npm run scenario:build. DO NOT EDIT. */',
    style: { singleQuote: true }
  });
  return new Map([
    [RUNTIME_PATH, runtimeSource(module, hash)],
    [TYPES_PATH, types],
    [DOC_PATH, moduleDoc(module, hash)],
    [SCHEMA_DOC_PATH, schemaDoc(schema)],
    [AUTHOR_GUIDE_PATH, authorGuide()],
    [MIGRATION_DOC_PATH, migrationDoc(module, hash)]
  ]);
}

async function main() {
  const command = process.argv[2] ?? 'validate';
  const { module, schema, hash } = loadAndValidate();
  if (command === 'validate') {
    console.log(`Scenario ${module.manifest.id}@${module.manifest.contentVersion} valid (${hash})`);
    return;
  }
  const generated = await outputs(module, schema, hash);
  const selected = command === 'build'
    ? [...generated].filter(([path]) => path === RUNTIME_PATH || path === TYPES_PATH)
    : command === 'docs'
      ? [...generated].filter(([path]) => path !== RUNTIME_PATH && path !== TYPES_PATH)
      : [...generated];
  if (command === 'check') {
    const stale = selected.filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content);
    if (stale.length) throw new Error(`生成文件未同步：\n${stale.map(([path]) => `- ${relative(ROOT, path)}`).join('\n')}\n请运行 npm run scenario:generate`);
    console.log(`Scenario generated files are current (${hash})`);
    return;
  }
  if (!['build', 'docs', 'generate'].includes(command)) throw new Error(`未知命令：${command}`);
  for (const [path, content] of selected) {
    ensureParent(path);
    writeFileSync(path, content);
    console.log(`generated ${relative(ROOT, path)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
