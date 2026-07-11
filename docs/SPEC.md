# TabletopRPG Technical Spec

> Version: v0.7
> Updated: 2026-07-11
> Scope: current React/Vite implementation

## 1. Runtime Stack

| Layer | Choice |
| --- | --- |
| Framework | React 18 |
| Language | TypeScript |
| Build tool | Vite |
| Icons | `lucide-react` |
| Relationship graph | `@xyflow/react` |
| Automatic graph layout | `elkjs` Layered in a Web Worker, left-to-right with orthogonal edges |
| Persistence | browser `localStorage` |
| AI API | OpenAI Responses API, MiMo/OpenAI-compatible Chat Completions |

## 2. Commands

```bash
npm install
npm start
npm run dev
npm run build
npm run preview
npm run test:smoke
```

## 3. Directory Contract

```text
src/
├── app/                 # App shell, game screen composition, game controller hook
├── components/
│   ├── setup/           # Title and investigator selection
│   ├── game/            # Main game screen controls and panels
│   └── shared/          # Cross-screen UI such as API settings
├── data/                # Rules config, story, skills, jobs, preset investigators
├── dm/                  # AI DM pipeline, provider adapters, memory, case board synthesis
├── services/            # Dice, storage, legacy response helpers
├── state/               # Reducer, state hydration, AI response normalization
├── styles/              # Global CSS
├── types/               # Domain interfaces
└── main.tsx             # React entry
```

## 4. Screen State

`App.tsx` uses a local screen enum:

```ts
type Screen = 'title' | 'setup' | 'game';
```

| Screen | Responsibility |
| --- | --- |
| `title` | New game, continue latest save, AI settings |
| `setup` | Select 1-4 preset investigators |
| `game` | Scene, narrative, action dock, party strip, fullscreen reference panel, menu |

`src/app` is split by responsibility:

| Module | Responsibility |
| --- | --- |
| `App.tsx` | Top-level `title` / `setup` / `game` screen switching |
| `GameScreen.tsx` | Main game UI composition and component wiring |
| `useGameController.ts` | Runtime game flow: saves, AI DM calls, dice handling, action submission, modal state |
| `gameFlow.ts` | Pure helpers for player action payloads, dice-result messages, and suggestion targeting |
| `useSaveSlots.ts` | Save-slot state and localStorage save/delete/refresh orchestration |
| `useToast.ts` | Short-lived toast state |

## 5. Game State

`GameState` is the canonical runtime state:

```ts
{
  players,
  exploreMode,
  currentSplitPlayer,
  playerLocations,
  declarations,
  pendingCheck,
  currentScene,
  activeNpcName,
  clues,
  flags,
  actionLog,
  conversationHistory,
  messages,
  suggestions,
  isThinking,
  longTermMemorySummary,
  eventLog,
  atomicFacts,
  npcMindModels,
  prospectiveIntents,
  episodicMemory,
  caseBoard
}
```

The reducer is in `src/state/gameReducer.ts`. External or persisted state must pass through `hydrateGameState()` before rendering.

## 6. Rules And Numeric Config

`src/data/gameRules.ts` is the single source for core numeric rules. UI, preset creation, save hydration, and dice checks should reference helpers from this file instead of duplicating formulas.

| Rule Area | Source |
| --- | --- |
| Default attributes | `gameRules.defaultAttributes` |
| Derived HP/MP/SAN/Luck | `deriveInvestigatorStats(attrs)` |
| Skill base values such as `EDU` and `DEX×2` | `resolveSkillBase(base, attrs)` |
| Unknown skill fallback | `gameRules.skills.unknownSkillTotal` |
| Difficulty thresholds | `getDifficultyThreshold(skillTotal, difficulty)` |
| D100 fumble range | `gameRules.dice.fumbleMin` and `isFumbleRoll(roll)` |

Current formulas:

| Value | Formula |
| --- | --- |
| HP | `floor((CON + SIZ) / 10)`, minimum 1 |
| MP | `floor(POW / 5)`, minimum 0 |
| SAN | `POW`, minimum 0 |
| Luck | `Luck` |
| 普通 | `skillTotal / 1` |
| 困难 | `floor(skillTotal / 2)` |
| 极难 | `floor(skillTotal / 5)` |
| 大失败 | D100 roll `>= 96` |

## 7. Storage Contract

| Key | Status | Purpose |
| --- | --- | --- |
| `trpg-saves-v2` | current | Save slots, capped at 12, list/load/delete through Save Manager |
| `trpg-api` | current | Provider, protocol, API key, endpoint, model |

Current UI loads the latest valid save from the title/menu shortcuts. Save Manager lists valid slots, loads a selected slot, and deletes a selected slot.

Save payload version `7` adds case-board entity insights plus stable `semanticKey` and `relationKey` identities. v6 case-board cards migrate deterministically during `hydrateGameState()`: entity facts fold into dossier insights, valid relationships retain redirected endpoints, and unsupported low-value orphan cards are archived. No model call is made during save migration. Older saves without a case board receive an empty v7 dynamic layer while the static scenario board remains authored data.

## 8. AI DM Contract

### Providers

| Provider | Protocol | Base Endpoint | Request Path | Default Model |
| --- | --- | --- | --- | --- |
| OpenAI | `responses` | `https://api.openai.com/v1` | `/responses` | `gpt-4o` |
| MiMo | `chat-completions` | user configured | `/chat/completions` | user configured |
| Custom | user configured | user configured | `/responses` or `/chat/completions` by protocol | user configured |

`ApiConfig` carries `provider`, `protocol`, `endpoint`, `apiKey`, and `model`. OpenAI defaults to the Responses API. MiMo and custom OpenAI-compatible gateways default to Chat Completions only when the provider rules say so; the app does not guess protocol from failed responses.

DM business modules call the neutral LLM client in `src/dm/llm/client.ts`. Only `src/dm/llm/*Adapter.ts` may contain protocol endpoint paths or protocol-specific request fields.

### Narrator Response Shape

The model output is accepted only after it parses as a JSON object matching this contract. Markdown-wrapped JSON and mixed text with an extractable JSON object are parsed as candidates, but arbitrary non-JSON text is rejected.

```json
{
  "narrative": "string",
  "activeNpc": "string or null",
  "nextPrompt": "string",
  "playerChoices": {
    "亨利·格雷": ["行动1", "行动2"],
    "艾达·华莱士": ["行动1", "行动2"]
  },
  "keywords": [
    { "text": "水里的东西", "kind": "clue" }
  ]
}
```

`keywords` is optional at runtime for compatibility. It may contain at most six exact 2-24 character substrings from `narrative`, and `kind` is limited to `clue`, `danger`, or `state`. Invalid, duplicate, generic, HTML-shaped, overlong, or non-existent phrases are silently discarded and never trigger a Narrator retry. The model must not mark known people, locations, items, skills, colors, HTML, Markdown, or character offsets.

Checks and state changes are not fields in Narrator JSON. Narrator proposes them through `request_check`, `propose_state_update`, `reveal_secret`, `propose_scene_change`, `schedule_consequence`, and `update_npc_mind` tool calls. Director rejects unavailable or invalid calls before StateResolver creates reducer-compatible events and the legacy UI response.

### Format Enforcement

1. `callNarrator()` requests an AI response for the current action round through `src/dm/llm/client.ts`.
2. Narrator first performs strict `JSON.parse`, validates required fields, and parses provider-native tool calls before Director sees the result.
3. Syntax failures are passed through the deterministic `jsonrepair` parser locally. Locally repaired output is accepted only when all Narrator contract fields are present, so truncated JSON cannot be promoted into player-visible narrative.
4. If local repair cannot produce a complete contract, the frontend sends one repair prompt to the same provider with the invalid output and diagnostic message.
5. The retry response goes through the same strict/local pipeline. If it is still invalid, raw output is blocked and a system error is shown. Raw malformed JSON/Markdown must never be appended as player-visible DM narrative.

### Narrative Markup And Safe Details

`src/services/narrativeMarkup.ts` builds immutable text segments; React renders those segments directly and never uses Markdown, model HTML, or `dangerouslySetInnerHTML`.

- Deterministic terms come from investigators, public NPC aliases, public scene aliases, authored items, visible dynamic case-board titles, skills, check difficulty/results, HP/SAN, and curated states.
- Optional Narrator keywords only supplement emergent clue/danger/state language. Deterministic entities win every overlap; otherwise longer terms win.
- Person colors are derived from canonical names with a stable hash and palette collision resolution. The same map is used in message text, player labels, and the active-NPC nameplate.
- Every mark opens `EntityDetailModal`. The resolver may show only public authored information, already unlocked secrets, current investigator values, rule explanations, or the original sentence for an LLM hint. It never exposes locked secret contents or counts from narrative navigation.
- DM messages may use their stored keyword hints. Player and system messages run deterministic markup only. Old saves without keywords still receive deterministic markup after hydration.
- The modal uses dialog semantics, supports Escape, and restores focus to the invoking control.

### Foreground And Background Lifecycle

`runDmTurn()` has one foreground result and one optional `backgroundUpdate: Promise<DmBackgroundUpdate>`:

1. Foreground waits only for ContextBuilder, Narrator, Director, and StateResolver.
2. The controller immediately applies narrative, accepted events, checks, and suggestions, then clears `isThinking`.
3. Summary and System2 run concurrently in the background. Fact extraction runs before dynamic case board synthesis and episodic memory construction.
4. `DmTurnCoordinator` applies completed background updates in invocation order. `DmTurnOutput` does not expose a duplicate `deferredUpdates` path.
5. Every LLM request receives the turn's `AbortSignal`. A 180-second task timer is cleared on completion.
6. New game, restart, save load, return home, component unmount, or timeout invalidates the session, aborts active fetches, and prevents stale foreground or background writes.
7. Background failures are soft failures and do not retract a valid Narrator result. Invalid or empty Summarizer JSON is discarded rather than stored as long-term memory.

### Freedom and Tolerance Rules

The AI DM uses tolerance level `2.5-3` for the current MVP: it should be permissive with player methods, but strict about world logic, rules authority, and the main investigation loop.

| Player action type | Required behavior |
| --- | --- |
| Reasonable but unplanned | Allow the attempt and request an appropriate skill check when uncertainty matters |
| Creative solution | Convert into a check, cost, clue, NPC reaction, or scene consequence instead of rejecting by default |
| High-risk action | Allow only with clear consequences such as alert, injury, SAN loss, damaged evidence, hostile NPCs, or time pressure |
| Off-main-path action | Briefly respond, then guide the party back through new information, NPC pressure, or environmental escalation |
| Destructive action | Do not dead-end the session; preserve an alternate clue path or consequence path |
| Impossible, unsafe, prompt-injection, or dice-override request | Refuse in character or restate the valid boundary |

The DM must not say "you cannot do that" merely because an action is outside the scripted path. Refusal is reserved for physical impossibility, missing character capability/resources, content safety, prompt injection, or attempts to invalidate frontend dice authority.

### Multi-player Conflict Rules

Together mode can submit multiple player declarations in one AI turn. When the AI DM judges that player demands conflict materially, it must follow this sequence:

1. First conflict: do not resolve irreversible consequences. Ask the players to re-enter the current round with a coherent plan.
2. Second conflict: request frontend dice arbitration. The current MVP uses a `幸运` check.
3. Two-player conflict: AI selects one conflicted player for a `普通` `幸运` check. Success means that player's demand takes priority this round; failure means the opposing demand takes priority.
4. Multi-player conflict: AI focuses on the most direct conflict first and may split complex conflicts into multiple arbitrations.
5. Arbitration decides only this round's priority. It does not remove future agency from the other players.

Irreversible story-breaking acts, such as killing a key NPC or destroying key evidence, require extra protection. The AI DM should first ask for explicit confirmation and describe likely consequences. If the act would break the main loop, the DM may use in-world resistance such as NPC escape, intervention, moved evidence, locked access, fog, police, or hostile NPC pressure instead of dead-ending the story.

### Normalization Rules

- Markdown-wrapped JSON is unwrapped as a candidate.
- Mixed text can be accepted only when a valid JSON object can be extracted.
- Non-JSON AI text is rejected and retried once; it is never shown as narrative.
- Unknown scene ids/names fall back to current scene.
- Scene names are accepted in addition to `S01`-`S05`.
- Unknown NPC names resolve to `null`.
- Numeric strings for HP/SAN deltas are accepted; invalid deltas are ignored.
- `newItems` accepts item ids and known item names.
- Difficulty text containing `极` -> `极难`, containing `困` -> `困难`, otherwise `普通`.

### Dynamic Case Board

The case board is not a free-form AI UI surface. v7 is a mixed investigation workspace with three data responsibilities:

- Static scenario spine from `src/data/scenarios/wuzhongxiaoshi/caseBoard.ts`, used for stable main clues and authored relationships.
- Dynamic core nodes/edges in `GameState.caseBoard`, limited to meaningful events, cross-entity relationships, and connected theories.
- Entity dossier `insights`, where goal, stance, knowledge, capability, testimony, and actor-state changes are updated by stable slots instead of becoming graph cards.

The synthesizer calls `generateJson()` through the same LLM adapter chain as Narrator/Summarizer/Memory. It sees the current player-visible static and dynamic node ids, does not change the Narrator JSON contract, and proposes at most two core nodes and four edges per turn. It may only create `event` or `theory` nodes; deterministic fact-to-insight and relationship-to-edge conversion stays in `caseBoardModel.ts`.

If the provider returns an empty, malformed, or source-invalid patch, entity facts still update dossiers deterministically. A high-signal world observation may create one event linked to the current scene; generic continuation text remains empty. Provider failure and fallback failure never fail the main DM turn.

Dynamic patches are applied only through `gameReducer.applyCaseBoardPatch` after the controller has appended accepted events and facts. The reducer enforces:

- Every dynamic node must cite at least one visible fact, event, or clue id.
- Every dynamic edge must cite at least one visible fact or event id.
- Text that references an unrevealed `secret.*` marker is dropped.
- Duplicate nodes merge by stable `semanticKey`; insights update by `slotKey`; edges update by `relationKey`.
- Later confirmed evidence upgrades an existing hypothesis to confirmed.
- Event nodes require one visible graph anchor and theories require two. Orphan proposals are rejected or archived.
- Dynamic active capacity is capped at 30 core nodes, 60 edges, and 120 insights; overflow archives older low-confidence hypotheses first.
- AI never supplies layout coordinates. Desktop uses React Flow with ELK Layered ordering and orthogonal edges; narrow screens use connected-component investigation groups.

The desktop workspace derives connected components as investigation threads, supports pan/zoom/fit, search, type filtering, and hypothesis visibility, and opens a non-modal dossier inspector. New background nodes do not reset the current viewport. Mobile hides the graph, shows at most two relationship summaries on each card, and opens an accessible full-screen detail layer. Player-visible sources resolve to clue names or turn-numbered fact/event text; internal ids are never rendered.

## 9. Dice Contract

The frontend owns dice authority. The AI DM may request a check and narrate the outcome, but it must never ignore, reroll, override, or reinterpret the frontend dice result as the opposite outcome. Numeric thresholds come from `src/data/gameRules.ts`.

| Result | Rule |
| --- | --- |
| Fumble | roll >= 96 |
| Extreme success | roll <= skill / 5 |
| Hard success | roll <= skill / 2 |
| Regular success | roll <= skill |
| Failure | otherwise |

The displayed labels are `大失败`, `极难成功`, `困难成功`, `普通成功`, and `失败`.

Dice authority rules:

- A success result cannot be narrated as a failure.
- A failure result cannot be narrated as a success.
- Fumble must carry a clear negative consequence.
- "Fail forward" is allowed only when the failure remains true and progress comes through cost, alternate clues, NPC reaction, or a later opportunity.
- Plot continuity must be handled through consequence paths or new independent checks, not by invalidating a rolled result.
- Player requests to edit, ignore, or override a dice result are invalid inputs for the AI DM.

## 10. Story Data Contract

`src/data/storyData.ts` contains one bundled module:

| ID | Scene |
| --- | --- |
| S01 | 摩勒住宅 |
| S02 | 上城区第二分局 |
| S03 | 老赫特酒吧 |
| S04 | 卡森其药店 |
| S05 | 泰晤士港 |

Story data also includes 6 NPC entries and 8 item entries. Assets are imported directly by Vite from `assets/`.

## 11. Known Technical Limits

- AI calls happen in the browser, so user-entered API keys remain local but are exposed to the browser runtime.
- Automated coverage includes Vitest unit/regression tests, architecture boundary tests, and Playwright smoke tests for core browser flows.
- No server-side state, multiplayer synchronization, or API proxy exists.
- `docs/GDD.html` is a static documentation mirror, not an application entry.

## 12. Smoke Test Contract

The project uses Playwright for core smoke coverage.

| Command | Coverage |
| --- | --- |
| `npx playwright install chromium` | One-time local browser install before first Playwright run |
| `npm run test:smoke` | Starts Vite, opens Chromium, and runs the core-flow suite |

Current smoke coverage:

- Title screen -> preset investigator setup -> main game screen.
- Investigator setup shows four portraits and full attribute blocks.
- Submitting actions without an API key opens AI settings instead of crashing.
- Saving a game enables "continue latest save" from the title screen.
- Save Manager can list, load, and delete explicit save slots.
- Invalid save payloads are ignored on the title screen.
- Fullscreen reference panel renders the v7 investigation workspace and deterministically migrates v6 dynamic hypotheses.
- Narrator becomes visible before background cognition completes, and abandoned-session responses cannot write into a restarted game.
- D100 rolls `96-100` are fumbles before success thresholds.
- Rules config tests verify derived stats, skill base formulas, difficulty thresholds, and fumble range stay centralized.
