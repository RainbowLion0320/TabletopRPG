# AI 提示词目录

本目录存放所有 AI 提示词文件，**版本化管理是本项目最重要的资产之一。**

每次修改提示词必须通过 Git commit 记录，保留完整可回溯历史。

> 当前运行版提示词以内嵌常量形式分布在 `src/dm/` 管线中，主要包括 `src/dm/narrator.ts`、`src/dm/summarizer.ts`、`src/dm/memory/factExtractor.ts` 和 `src/dm/memory/system2Synthesizer.ts`。此目录用于后续外部化、版本化和对比不同提示词方案；新增文件后需要同步代码接入方式和 `docs/SPEC.md`。

## 文件命名规范

```
{角色/功能}_{版本}.md
```

示例：`dm_system_v1.md`、`dm_system_v2.md`

## 目录规划

```
prompts/
├── dm_system_v1.md      # DM 系统提示词（AI 主角色设定）
├── npc_base.md          # NPC 通用提示词模板
├── event_generator.md   # 随机事件生成提示词
└── templates/           # 可复用的提示词片段
```

## 提示词编写规范

1. **顶部注明版本、作者、修改日期**
2. **写清楚这个提示词的用途**（给谁用？在哪个环节调用？）
3. 每次迭代新建文件（`v1` → `v2`），不直接覆盖旧版本
4. 重大改动在 commit message 中说明改了什么、为什么改
5. 接入运行时代码时必须通过 `src/dm/llm/client.ts`，不得在提示词模块里直接调用模型 endpoint

## 负责人

主要由**刘晓**编写与迭代，**唐龙翔**协助。Robert 负责将提示词接入代码。
