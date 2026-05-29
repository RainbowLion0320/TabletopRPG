# TabletopRPG Technical Spec

> Version: v0.4
> Updated: 2026-05-29
> Scope: current React/Vite implementation

## 1. Runtime Stack

| Layer | Choice |
| --- | --- |
| Framework | React 18 |
| Language | TypeScript |
| Build tool | Vite |
| Icons | `lucide-react` |
| Persistence | browser `localStorage` |
| AI API | Anthropic Messages API, OpenAI Chat Completions, MiMo/OpenAI-compatible custom endpoint |

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
├── app/                 # App orchestration and screen state
├── components/
│   ├── setup/           # Title and investigator selection
│   └── game/            # Main game screen controls and panels
├── data/                # Story, skills, jobs, preset investigators
├── services/            # AI, dice, storage
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
| `game` | Scene, narrative, action dock, party strip, info drawer, menu |

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
  isThinking
}
```

The reducer is in `src/state/gameReducer.ts`. External or persisted state must pass through `hydrateGameState()` before rendering.

## 6. Storage Contract

| Key | Status | Purpose |
| --- | --- | --- |
| `trpg-saves-v2` | current | Save slots, capped at 12, list/load/delete through Save Manager |
| `trpg-api` | current | Provider, API key, endpoint, model |

Current UI loads the latest valid save from the title/menu shortcuts. Save Manager lists valid slots, loads a selected slot, and deletes a selected slot.

## 7. AI DM Contract

### Providers

| Provider | Endpoint | Default Model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o` |
| Anthropic | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet-latest` |
| MiMo | `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` | `mimo-v2.5` |
| Custom | `{endpoint}/chat/completions` | user configured or `gpt-4o` |

### Response Shape

```json
{
  "narrative": "string",
  "activeNpc": "string or null",
  "check": {
    "skill": "侦查",
    "difficulty": "普通",
    "player": "亨利·格雷",
    "reason": "optional"
  },
  "stateUpdate": {
    "hp": { "亨利·格雷": -1 },
    "san": {},
    "flags": {},
    "newItems": ["I01"],
    "sceneChange": "S02"
  },
  "nextPrompt": "string",
  "playerChoices": ["行动1", "行动2", "行动3"]
}
```

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

- Markdown-wrapped JSON is unwrapped.
- Fallback extracts the first JSON-like object.
- Non-JSON AI text is shown as narrative.
- Unknown scene ids/names fall back to current scene.
- Scene names are accepted in addition to `S01`-`S05`.
- Unknown NPC names resolve to `null`.
- Numeric strings for HP/SAN deltas are accepted; invalid deltas are ignored.
- `newItems` accepts item ids and known item names.
- Difficulty text containing `极` -> `极难`, containing `困` -> `困难`, otherwise `普通`.

## 8. Dice Contract

The frontend owns dice authority. The AI DM may request a check and narrate the outcome, but it must never ignore, reroll, override, or reinterpret the frontend dice result as the opposite outcome.

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

## 9. Story Data Contract

`src/data/storyData.ts` contains one bundled module:

| ID | Scene |
| --- | --- |
| S01 | 摩勒住宅 |
| S02 | 上城区第二分局 |
| S03 | 老赫特酒吧 |
| S04 | 卡森其药店 |
| S05 | 泰晤士港 |

Story data also includes 6 NPC entries and 8 item entries. Assets are imported directly by Vite from `assets/`.

## 10. Known Technical Limits

- AI calls happen in the browser, so user-entered API keys remain local but are exposed to the browser runtime.
- Automated coverage is currently smoke-level only: `tests/smoke.spec.ts` covers core navigation, no-key AI guard, save/continue, save manager load/delete, invalid save filtering, and D100 fumble priority.
- No server-side state, multiplayer synchronization, or API proxy exists.
- `docs/GDD.html` is a static documentation mirror, not an application entry.

## 11. Smoke Test Contract

The project uses Playwright for core smoke coverage.

| Command | Coverage |
| --- | --- |
| `npx playwright install chromium` | One-time local browser install before first Playwright run |
| `npm run test:smoke` | Starts Vite, opens Chromium, and runs the core-flow suite |

Current smoke coverage:

- Title screen -> preset investigator setup -> main game screen.
- Submitting actions without an API key opens AI settings instead of crashing.
- Saving a game enables "continue latest save" from the title screen.
- Save Manager can list, load, and delete explicit save slots.
- Invalid save payloads are ignored on the title screen.
- D100 rolls `96-100` are fumbles before success thresholds.
