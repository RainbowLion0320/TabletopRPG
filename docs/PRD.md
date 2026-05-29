# TabletopRPG PRD

> Version: v0.4
> Updated: 2026-05-29
> Product baseline: Vite + React + TypeScript MVP

## 1. Product Positioning

TabletopRPG is a local web TRPG experience where an AI DM hosts the COC-inspired investigation module "雾中消逝". The current product targets a single browser session with local hot-seat play, fast preset investigator selection, AI-driven narration, D100 checks, and local save/load.

## 2. Target Users

| User | Need |
| --- | --- |
| TRPG player without a dedicated KP | Start a lightweight investigation session quickly |
| Small local group | Share one screen and submit actions together or one investigator at a time |
| Developer/designer team | Iterate module data, prompts, UI, and assets inside one repository |

## 3. Current MVP Scope

### In Scope

- Title screen with new game, continue game, and AI settings.
- Preset investigator selection for 1-4 investigators, with portraits, full attributes, derived stats, skill values, and background cues.
- Main game screen with scene art, narrative feed, action dock, investigator party portraits/status, menu, and info drawer with active NPC information.
- Together mode: all selected investigators submit one action round together.
- Split mode: one investigator acts in a selected scene at a time.
- AI DM integration through OpenAI, Anthropic, MiMo, or a custom OpenAI-compatible endpoint.
- Strict JSON-oriented AI response contract with fallback parsing.
- D100 skill check flow handled by the frontend.
- State updates for HP, SAN, flags, scene change, clues, active NPC, and suggested actions.
- localStorage saves with latest-save load and save manager list/load/delete through `trpg-saves-v2`.
- Built-in story data for "雾中消逝": 5 scenes, 6 NPC entries, 8 clue items.
- Automated smoke tests for the title/setup/game flow, setup portrait/full-attribute display, no-key AI settings guard, save/continue, invalid saves, and D100 fumble priority.

### Out of Scope for Current MVP

- Custom investigator creation UI.
- Online or LAN multiplayer.
- Full combat initiative, weapon damage, ammunition, or SAN madness automation.
- Audio/BGM/SFX.
- Backend API proxy or account system.
- Multi-module import/editing.

## 4. Core User Flows

### New Game

1. User opens title screen.
2. User chooses "开始游戏".
3. User selects 1-4 preset investigators.
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
3. App calls AI DM with current state and actions.
4. AI returns a JSON object matching the response contract.
5. App validates the response format before it reaches the reducer.
6. If the first AI response is malformed, App retries once with a format-repair prompt; if still invalid, the raw output is blocked and shown only as a system error.
7. App normalizes the valid response and updates narrative, checks, state, clues, scene, and suggestions.

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
| Submit action | Missing API key opens AI settings instead of crashing |
| AI response | Malformed model output is retried once and never displayed as DM narrative |
| AI response | Invalid scene names, unknown NPCs, string numeric deltas, and clue names are normalized or ignored safely after format validation |
| Dice | 96-100 is treated as fumble before success levels |
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
| AI DM prompt and provider calls | `src/services/aiDm.ts` |
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
