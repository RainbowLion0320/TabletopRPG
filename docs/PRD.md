# TabletopRPG PRD

> Version: v0.9
> Updated: 2026-09-09
> Product baseline: Vite + React + TypeScript MVP

## 1. Product Positioning

### Android companion build — 2026-09-09

The Android edition is a separate, installable APK that preserves the existing web release. It reuses the same investigation, rules, art, audio and 1–4-player hot-seat game. The Android entry adds a touch-friendly portrait layout, system-back behavior, encrypted local settings/saves and automatic session recovery. On first entering the game, players supply their own AI DM API configuration; build-time developer keys are never bundled. Local assets work without a desktop server; AI turns still require a configured online service. Release packaging and acceptance checks are defined in [ANDROID.md](ANDROID.md).

Android 0.2.1 treats short landscape viewports as the primary UI target. At 560×280 through 960×432 CSS pixels, navigation and dialog close/save controls must remain reachable; long cards, archives and descriptions scroll in their own content areas. The action input and submit control remain reachable with 180 CSS pixels of keyboard-reduced height. Investigators default to one, with explicit 2/4-player coverage. Layout acceptance includes screenshots and clipping/touch-occlusion checks in the actual APK; desktop tests alone are insufficient.

Android 0.3.0 replaces the landscape interface with a portrait layout. NPC art occupies a separate upper stage, the narrative scrolls in the middle, and actions stay at the bottom. Body text is 15 CSS pixels and primary input/submit targets remain at least 44 pixels high. Selection uses a vertical card list with a persistent selected count and start footer; multi-player status uses two columns. API forms, audio, dossiers, archive cards, saves and dice all have portrait layouts. Expanded reading, scenes without an NPC and keyboard-reduced windows reclaim the stage. Acceptance covers 320×568 through 600×960 CSS pixels, including 1/2/4 players, locked portrait orientation, no clipped controls and keyboard-reduced input.

TabletopRPG is a local web TRPG experience where an AI DM hosts the COC-inspired investigation module "雾中消逝". The current product targets a single browser session with local hot-seat play, fast preset investigator selection, AI-driven narration, D100 checks, and local save/load.

## 2. Target Users

| User | Need |
| --- | --- |
| TRPG player without a dedicated KP | Start a lightweight investigation session quickly |
| Small local group | Share one screen, declare actions in turn, and resolve each round as one party |
| Developer/designer team | Iterate module data, prompts, UI, and assets inside one repository |

## 3. Current MVP Scope

### In Scope

- Title screen with new game, continue game, and AI settings.
- Preset investigator selection for 1-4 investigators, defaulting to Henry alone for solo play, with portraits, full attributes, derived stats, skill values, and background cues.
- Main game screen with scene art, narrative feed, action dock, investigator party portraits/status, menu, and a fullscreen investigation workspace centered on a player-known case board.
- Mixed case board: authored main-clue spine, reviewed AI events/theories, entity dossier insights, automatic relationship layout, investigation-thread navigation, search, type filters, and a narrow-screen grouped list.
- Safe interactive narrative highlighting for people, locations, evidence, skills, checks, and temporary model-suggested clue/danger/state phrases.
- Party exploration: all selected investigators always share one scene, declare actions sequentially, and resolve the completed round together.
- Party movement: any valid scene transition moves every investigator and synchronizes the chapter, backdrop, resident NPC, and AI context.
- AI DM integration through OpenAI Responses, MiMo, or a custom OpenAI-compatible Chat Completions endpoint.
- Strict JSON-oriented AI response contract with fallback parsing.
- DM event summaries and internal event IDs stay out of player-facing conversations and logs, including older saves. Players retain narrative, dice results, actual stat changes, endings and actionable error feedback.
- Network and provider failures show their actual category (connection, authentication, permissions, rate limit or service error) and retain the current round for manual retry; they do not enter JSON repair retries.
- D100 skill check flow handled by the frontend, using the supplied bronze dice panel, transparent roll animation and Zihun Yunque Song throughout the dice interface.
- Scene-aware background music, subtle environment loops, interface/paper/dice/result sounds; separate music/effects switches and volume sliders in title/setup/game menus. Preferences persist independently of saves. Audio starts after user interaction, pauses in hidden tabs, and never gates gameplay.
- YAML-authored hard mainline with structured beats, objectives, facts, events, fail-forward, world time, clocks, encounters, and three executable endings.
- Player-visible objectives, clue progress, visible clocks, active act/scene, and ending-locked action area.
- State updates for HP, SAN, flags, scene change, clues, active NPC, and suggested actions.
- v8 localStorage saves with module version/hash validation and deterministic v1-v7 migration through `trpg-saves-v2`.
- Built-in YAML module "雾中消逝": 5 scenes, 5 stable NPC entities, 8 clue items, 6 beats, fail-forward routes, and 3 endings.
- Automated smoke tests for the title/setup/game flow, setup portrait/full-attribute display, fullscreen case board reference panel, dynamic case board hypotheses, no-key AI settings guard, save/continue, invalid saves, and D100 fumble priority.

### Out of Scope for Current MVP

- Custom investigator creation UI.
- Online or LAN multiplayer.
- Full combat initiative, weapon damage, ammunition, or SAN madness automation.
- Backend API proxy or account system.
- Multi-module import/editing.

## 4. Core User Flows

### New Game

1. User opens title screen.
2. User chooses "开始游戏".
3. Henry is selected by default. The user can play immediately, replace him, or select additional investigators (1-4 total).
4. App initializes a new `GameState` at scene `S01`.
5. User enters the main game screen.

### Continue Game

1. App reads saves from `trpg-saves-v2`.
2. Title screen enables "继续游戏" when a valid save exists.
3. User loads the latest save.
4. App hydrates missing fields before rendering.

### Action Round

1. User enters investigator actions.
2. App appends player messages and conversation history.
3. App starts a session-scoped AI DM turn and calls Narrator through the configured protocol adapter.
4. Narrator returns player-facing JSON plus optional tool calls; Director validates tools and StateResolver translates accepted calls.
5. The valid narrative is applied immediately and the thinking indicator is cleared.
6. Summary, System2, fact extraction, episodic memory, and dynamic case board synthesis continue in the background without blocking player feedback.
7. Background updates are applied in DM-turn order. Restart, load, home navigation, timeout, or unmount aborts the old session and prevents stale writes.
8. If Narrator JSON is malformed, App first tries local syntax repair, then one model repair, then one final fresh attempt. Persistent failure shows a system error and a retry button. The original actions and confirmed dice results can be saved, loaded, and retried without duplicate history.

### Skill Check

1. AI response includes `check`.
2. App calculates threshold from selected investigator skill and difficulty.
3. User rolls D100.
4. App shows result and sends a check-result message back to AI.

## 5. Acceptance Criteria

| Area | Criteria |
| --- | --- |
| Startup | `npm run dev` opens the app through Vite; `npm run build` succeeds |
| New game | Preset selection can enter the main game with at least one investigator |
| Party size | Solo play is the default; browser regression covers solo, two-investigator and four-investigator submission, D100 continuation, and save/load |
| Submit action | Missing API key opens AI settings instead of crashing |
| AI response | Malformed output has bounded automatic recovery (at most three normal Narrator attempts) and is never displayed as DM narrative; manual retry retains the same round |
| AI lifecycle | Narrator is player-visible before optional cognition jobs finish; background results are ordered and stale sessions cannot write state |
| AI response | Invalid scene names, unknown NPCs, string numeric deltas, and clue names are normalized or ignored safely after format validation |
| Narrative reading | Names use stable per-person colors; semantic marks preserve the exact source text and open player-safe details without rendering model HTML or exposing locked secret counts |
| Narrative keywords | Optional model hints are exact narrative substrings, limited to 6 clue/danger/state phrases, and invalid hints are dropped without retrying Narrator |
| Case board | The main graph contains only people, places, evidence, core events, and connected theories; goal/stance/knowledge/capability/state facts update entity dossiers instead of adding cards |
| Case board | Reviewed AI proposals use stable semantic/relation keys, cite player-visible sources, connect visible anchors, and never provide layout coordinates or locked information |
| Case board UI | Desktop uses automatic non-overlapping relationship layout and readable source details; narrow screens use investigation-thread groups with no horizontal overflow |
| Case board fallback | A high-signal world observation may create a conservative event linked to its scene; generic continuation turns do not add noise |
| Saves | v7 persists case-board insights and stable keys; v6 boards migrate deterministically without a model call |
| Dice | 96-100 is treated as fumble before success levels |
| Dice | SAN uses current sanity; attribute checks use actual attributes; mixed party outcomes are resolved independently |
| Dice UI | One click locks the result, plays the 2.5-second art sequence, and waits for explicit confirmation. Total and percentile faces agree (100 = 00 + 0); reduced motion, missing animation assets and narrow screens remain usable; all dice text uses the supplied font |
| Long sessions | Summary compaction preserves turn numbers and visited scenes; stale summaries cannot overwrite newer history |
| Recovery | Storage errors are visible; unconfirmed dice results cannot be saved; settings do not reload an unsaved game |
| Rules config | HP/MP/SAN, skill bases, difficulty thresholds, unknown skill fallback, and fumble range come from a centralized rules config |
| Saves | Latest save is visible on title screen after saving and returning home |
| Saves | Save manager lists valid slots, loads a selected slot, and deletes a selected slot |
| Saves | Invalid save payloads are ignored instead of crashing the title or game screen |
| Smoke tests | `npm run test:smoke` passes the automated core-flow suite |

## 6. Traceability

| Product Area | Code Source |
| --- | --- |
| App shell and screen flow | `src/app/App.tsx` |
| Main game UI composition | `src/app/GameScreen.tsx` |
| Runtime game flow controller | `src/app/useGameController.ts` |
| Save-slot UI state | `src/app/useSaveSlots.ts` |
| Player action flow helpers | `src/app/gameFlow.ts` |
| Game state reducer and hydration | `src/state/gameReducer.ts` |
| Rules and numeric config | `src/data/gameRules.ts` |
| AI DM pipeline and prompts | `src/dm/` |
| Case board model and synthesis | `src/dm/caseBoardModel.ts` + `src/dm/caseBoardSynthesizer.ts` + `gameReducer.applyCaseBoardPatch` |
| Case board relationship UI | `src/components/game/CaseBoard.tsx` + `caseBoardGraph.ts` |
| LLM provider adapter | `src/dm/llm/` |
| Dice checks | `src/services/dice.ts` |
| Save/load/API config | `src/services/storage.ts` |
| Story module data | `src/data/storyData.ts` |
| Preset investigators | `src/data/presets.ts` |
| Skills/jobs | `src/data/skills.ts` |
| Smoke tests | `tests/smoke.spec.ts` |
| AI response format tests | `tests/ai-dm.spec.ts` |
| Rules config tests | `tests/rules-config.spec.ts` |

## 7. Open Product Backlog

- Add custom investigator creation only after preset flow stays stable.
- Move API calls behind a backend proxy before public deployment with shared keys.
- Externalize prompt variants from code into `/prompts` after prompt iteration begins.
