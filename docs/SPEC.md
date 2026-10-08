# TabletopRPG Technical Spec

> Version: v0.7
> Updated: 2026-10-08
> Scope: current React/Vite implementation

In 0.4.20, `ActionDock` reuses one `PartyStatusStrip` in active and completed investigations. Ending records keep authored title/summary, fixed review/home actions and a read-only party; declaration status and action input remain absent. Component-owned ending CSS reserves the content's minimum height before the scene yields, preventing Grid/Flex intrinsic sizing from clipping the second party row; phone summaries clamp to two lines, with the full text in `InvestigationProgress`. Desktop ending layout uses scene/story/dock grid rows and supports expanding the story. `InfoDrawer.initialTab` selects progress for the ending action and board for the ordinary entry; closing restores the actual opener through the existing focus stack. `continuationPreview` reads the known ending to label automatic/current/manual completed records as a review; Android skips the model-configuration gate for those read-only records. No schema, endpoint, prompt, reducer reward or ending-definition changes.

## Android edition (2026-09-09)

In 0.4.23, `createNarrativeMarkup(state)` prepares the deterministic definitions and person palette once per `NarrativePanel` render. Each message independently normalizes its own hints without mutating the shared definitions. The next render reads the entire state again, including history, flags and scenario progress used by existing case-board visibility; there is no global cache or partial dependency list. Legacy `markNarrativeText` and `getPersonColor` retain their contracts. This removes repeated full-history knowledge scans and color sorting from each paragraph/person occurrence while preserving complete prose, matching priority, public-information boundaries, callbacks and scroll-follow behavior.

In 0.4.22, `narrative-tools.css` owns the bounded grid header, NPC nameplate and reading controls, replacing old scattered desktop/portrait overrides. Native buttons preserve the markup/detail callback and story scroll container, with 44px target geometry, known-person colors and the existing dossier/brass nine-slices. NPC names ellipsize only when space requires while retaining their full accessible name/title; the role tag folds below 360px only when the new-content action is present. Expand/collapse labels explicitly name the story. No game, scroll-follow, storage or AI behavior changes.

The 0.4.21 full regression exposed a narrative follow race when the scroll event trails an incoming reply. `NarrativePanel` measures the preceding visible entry's clamped start and reads the actual `scrollTop` before following a new ID; same-ID renders/scroll events refresh the reference. Replaced histories still open their latest entry, older readers keep their position and can explicitly jump to new content. Hidden records stay excluded. No timing delay or model retry is added.

In 0.4.21, `AudioSettingsButton` owns its channel, switch, fader and credits styling; obsolete audio overrides are removed from global/portrait styles. The outer flex card uses `overflow: clip`, a nonshrinking header and a bounded scrolling body. Real range inputs retain keyboard/touch behavior and expose stable label/output IDs plus percentage `aria-valuetext`. Native details keep source/license links collapsed until requested; links and visible controls have 44px targets. Volume events use the existing `AudioEngine.updateSettings` and encrypted preference path without new state fields, audio assets or save/AI changes. Formal native regression checks loop continuity, touch, small-window clipping and recreation persistence.

In 0.4.19, `InvestigatorSheet` keeps per-tab scroll offsets in a per-mount ref and restores them in a layout effect. A changed selected investigator clears offsets while retaining the existing skill query; changing or clearing that query resets the skills offset. Clear explicitly refocuses its search input without scrolling the outer sheet. Component-owned CSS reuses the existing dossier and brass nine-slices, keeps close/tabs/search above the independently scrolling body, and uses 44px teammate/clear targets. At phone heights below 360px, identity metadata and padding shrink while the horizontal teammate controls remain available. Table captions remain accessible without repeating visible column labels. Native regressions query [IME visibility through WindowInsetsCompat](https://developer.android.com/reference/androidx/core/view/WindowInsetsCompat#isVisible(int)) to verify that system Back first dismisses an open keyboard and then closes the dossier. No new assets, data fields, storage or rule changes.

In 0.4.18, `GameScreen` captures a `GameContinuation` before controller cancellation clears transient UI and invalidates requests. The checkpoint clears `isThinking` while retaining the original state and dice result. Web `App` keeps it in memory through title/setup navigation, preferring it to the latest explicit manual save; actual new-game entry clears it. `AndroidApp` sets its in-memory session before calling the existing encrypted persistence port, and guards both completion and failure against obsolete writes. Restoring uses the existing controller/reducer and revealed-die restoration; retained turns require an explicit retry, and aborted responses cannot write into the resumed investigation. `TitleScreen` uses public normalized progress for a compact preview, places Continue first when available, and focuses the primary action only from the body. The existing storage formats, web localStorage keys and AI protocol stay unchanged.

In 0.4.17, `InvestigationRecords` renders normalized, visible objectives before a native details review, omits zero-only clue counts, and joins visible clocks only to authored presentation labels/maxima. Native progress elements expose clamped visual values while the original numeric label remains unchanged. Log search filters player-visible entries before matching normalized text/time; it keeps reducer order and original records. `InfoDrawer` owns a per-open query/scroll ref, mounts only the active page and resets outer page scroll when switching; the log's fixed search and bounded internal list restore position on return. Component-owned dossier styles replace scattered 12–13px progress/log rules without new assets. No state, AI or storage contract changes.

In 0.4.16, `InfoDrawer` follows the same native/web portrait hook as the main game. The phone icon has ordinary click activation, no drag capture and no hidden percentage position. Desktop uses element-local Pointer Events/capture with a 6px movement tolerance; release, cancellation, lost capture and layout changes clear the gesture. Only a completed/cancelled drag suppresses its compatibility click, and the next pointer press or keyboard activation remains usable. This removes four persistent window listeners and the legacy manual board/canvas/compact-card CSS. Formal native checks send a real down/move/up sequence through the release WebView. See [Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

In 0.4.15, the desktop graph camera reacts to actual pane dimensions, layout geometry and the selected neighborhood rather than every model object render. It uses declared layout sizes and viewport helpers, waits until DOM/store dimensions agree, captures the view on opening details and restores it on close; changed layouts invalidate a stale saved view. Large neighborhoods focus the selected card if fitting all neighbors would make it unreadable. Direct viewport/bounds helpers also fix the controlled graph's ineffective queued fitView path. Reduced motion disables camera transitions. Chinese tools use 44px native buttons and respect zoom limits; the read-only graph has no delete shortcut or focusable edge actions. Photo/card styles are component-owned, and lazy loading still keeps React Flow/ELK out of phone archives. See [React Flow viewport helpers](https://reactflow.dev/api-reference/types/react-flow-instance).

In 0.4.14, the shared focus stack separates Escape ownership from focus trapping: a desktop inspector registers as the top dialog while Tab remains scoped to its enclosing archive; phone details retain their own trap. Containment orders simultaneous nested mounts, cleanup restores a connected opener only when focus has not moved elsewhere, and explicit return refs track the selected record. Case detail navigation contains only IDs in the visible graph model, trims revisited paths, retains query/type and resets body position on record changes. Phone Escape/system Back returns along this path before closing the inspector. Desktop graph records use native buttons while wrapper focus is disabled, supporting Enter/Space without duplicate tab stops. Public media and detail styles are shared, replacing old scattered rules; narrative scene images are supplied only for visited locations. Hidden-secret counts remain internal, source references fold by default, and the existing reducer/reveal contracts remain authoritative.

In 0.4.13, release verification precedes `Remove-ObsoleteApkArtifacts`: a validated named APK and matching SHA256 must exist in the explicit artifact directory. Retention sorts semantic versions, keeps the two newest plus any intentionally rebuilt older release, prunes only recognized top-level release/scratch names and strips incremental-install sidecars. It never descends into arbitrary folders or modifies unrelated deliveries. `npm run clean:generated` also removes the explicitly scoped, regenerable audio source cache after rejecting links; runtime MP3/manifest/licenses and raw material remain intact. Windows fixture tests cover stale files, sorting, bad checksums, outside targets and older rebuilds. Title/video-poster source is shared with the presentation; Git history retains the deleted original GIF/placeholder SVGs.

In 0.4.12, `useCaseBoardListLayout` combines native portrait mode with the 900px web breakpoint. `CaseBoardFlow` is imported only for desktop; ELK and its worker move into the dynamically imported `caseBoardLayout` module. Mobile records reuse the dossier nine-slice and existing scene/NPC images, without graph construction or worker requests. `InfoDrawer` has keyboard-operable ARIA tabs and a bounded page container; only records or the active progress/log body scroll. A clear-search action restores input focus, and switching to archive mode clears the hidden thread constraint while retaining query/type. Summaries omit zero counts and progress does not expose the authored clue total. The reducer, source references, visibility and save contracts remain authoritative and unchanged.

In 0.4.11, `SaveManagerModal` uses a portal, the shared modal focus stack and component-owned styles. Save cards reuse the existing nine-sliced dossier mount with live scene/time/party text. Inline confirmation focuses the safe action and only scrolls the list to reveal it; deletion synchronously guards duplicates, load and dismissal until persistence settles. Focus moves to the remaining slot's Load action or Close. Raw incompatibility reasons remain in diagnostics. `saveGameStateAndPersist` and `deleteSaveAndPersist` serialize manual library mutations; a failed flush restores the exact previous `trpg-saves-v2` cache so later native retries cannot apply an unconfirmed change. Existing sync helpers and v8 data remain compatible. A saving ref prevents repeated concurrent save clicks.

In 0.4.10, MiMo adapters use ordinary text mode with tools and JSON-object mode without tools, adding the response schema as a format contract; OpenAI/custom strict-schema paths remain unchanged. MiMo receives a bounded 4096-token reasoning allowance. Responses reasoning items and Chat reasoning content remain private within tool continuation history, never becoming narrative text. Tool-first Narrator proposals wait for one JSON-only continuation and final Director validation; no tool is applied early. Dodge uses floor(DEX/2). Hydration migrates only the legacy DEX-times-two base, restores the preset constable's lost allocation and preserves earned/custom values and consistent issued-check thresholds. Teammate comparison retains the skill query.

In 0.4.7, investigator setup has one component-owned stylesheet instead of rules spread across three global stylesheets. A native checkbox inside the card's selection label handles pointer and keyboard selection; its separate detail button expands an inline panel without toggling the party. All setup layouts use a fixed footer and an independently scrolling list. Generated dossier and brass artwork use nine-slicing with live text and existing Lucide icons; generic control selectors use `:where` to avoid overriding primary/state variants. No game-state, AI protocol or save-schema changes are involved.

In 0.4.9, `ActionDock` uses a bounded textarea that refits on text and width/viewport changes. Phone Enter is a newline; desktop Enter submits with the existing IME/repeat guards, while Shift Enter is a newline. The platform passes the portrait input behavior explicitly so wide native portrait windows keep it. Next-actor confirmation retains input focus; the declaration phase exposes current/completed states without changing turn ownership. `NarrativePanel` tracks the latest visible message ID and reader position, ignores hidden updates, preserves earlier reading and offers a temporary jump to the latest entry start. Replacement histories reset following. Multiline actions and drafts use the existing reducer, storage and request path. `GameMenu` uses a portal and the existing `useDialogFocus` stack, exposing `onClose` plus explicit opener expansion state. Nested audio closes first and restores focus to the menu. The API form uses stable label/control IDs, a native connection disclosure and a disabled fieldset inside an independent scrolling div; the fieldset itself is not the scroll container. The outer card uses `overflow: clip` to prevent focus-driven scrolling of its fixed header/footer. A synchronous saving ref guards duplicate submissions and dismissal until persistence settles. Provider/endpoint/protocol/model normalization remains in `aiConfig.ts`; no endpoint inference or credentials are added. New smoke saves intercept the development env-writer endpoint to keep test tokens inside disposable contexts.

In 0.4.6, Narrator and System2 response schemas use the current player/NPC roster to declare closed objects with all keys required. Optional memory values are nullable; internal dictionaries and saved data remain compatible. Production-schema contract tests cover both provider adapters and 1/2/4-player rosters. Check-instruction parsing respects clause boundaries, local negation and future scope; recovery matches each player/skill pair instead of skipping an entire batch when one tool exists. Direct outcome assertions use structured dice levels first, support legacy result text, and distinguish negated success from success. Quality advisories and warnings are accepted on the first response, without adding correction prompts. Blocking output still has bounded recovery.

Only developer diagnostics expose KP notes. Player-facing connection feedback maps error categories to known hints and strips raw provider bodies, including errors in older saves. API validation stays inside the configuration dialog. Dice transcript and journal entries use the same investigator/skill/result line with one roll value.

In 0.4.5, `narratedChecks.ts` bridges explicit present-tense check requests to `request_check` only when actor and an existing skill are unambiguous. It ignores negative/conditional/past phrasing, preserves model tool calls, skips settled dice actions, and passes recovered calls through Director before both semantic review and resolution. Location-name continuity uses accepted DM messages only; system errors and player assertions never become authoritative scene unlocks. Unconfirmed player guesses can be acknowledged. Local-detail diagnostics mentioning “剧情事件” are warnings, and wording/coverage advisories are classified before hard conflicts. Actual unresolved dice demands remain blocking.

`AiResponseFormatError.retryCorrection` carries the semantic hint into the final automatic recovery request (two Narrator attempts plus one final attempt, same timeout/state/actions). UI feedback sanitizes formatting/semantic diagnostics, places the latest failure in the action dock and filters old error records from story/log display. Repeated errors replace their predecessor; accepted DM narration clears them. No save-schema change is required.

In 0.4.4, portrait investigator selection stays single-column at every width. The former 600px two-column override is removed; setup navigation, the scrolling list and the fixed footer share a centered 720px maximum width. Breakpoint regression covers 599/600/601 CSS pixels, expanded attributes and preserved 1/2/4-player selection.

In 0.4.3, `GameScreen` stores only an inspected player ID for the new `InvestigatorSheet`. The sheet derives its content from the current `state.players`, preserving live updates without copying resources into UI state. `ActionDock` exposes native buttons for avatars and status cards; player narrative marks route to the same dossier while NPCs retain their existing detail view. Skill totals and difficulty thresholds use `getSkillTotal` / `getDifficultyThreshold`, including current luck. Equipment is taken only from explicit records. The modal uses a body portal and the existing dialog focus/back stack, with independent content scrolling, fixed search and keyboard-accessible tabs. It never calls the model or changes gameplay state, resources, declarations or actor index.

The portrait grid now allows the scene track to shrink from its preferred aspect-ratio height while the narrative track reserves 142px including its frame. This keeps at least 140px of narrative panel and the bottom dock inside a 320×568 four-player viewport after touch targets grow. Background artwork remains contained without distortion; keyboard-reduced windows still reclaim the stage.

In 0.4.2, `NarrativePanel` is a clipped flex column with a non-shrinking header and a separate, labelled `.narrative-scroll` region. Latest-message scrolling targets that region using its own relative offsets. Expanded portrait reading spans grid rows 2–3, below navigation and above actions; desktop expansion begins at the 64px navigation boundary. The toggle exposes `aria-expanded`. Scrolling never moves the NPC header or exposes text behind it.

Android 0.4.1 uses `@mipmap/ic_launcher` / `ic_launcher_round`, with legacy density PNGs, API 26 adaptive layers and API 33 monochrome layers. The splash theme shares the application icon. `scripts/prepare-app-icons.mjs` packages the supplied two-color artwork, centers its foreground within the 66/108 adaptive safe area, and emits web ICO / touch icons into `public/icons`; both entry points reference those local files.

In 0.4.0, `src/platform/layout.ts` initializes `fog-ui` and the reactive `portrait-ui` class. Native always uses portrait; the web entry uses it up to 700 CSS pixels and updates the setup footer via `useSyncExternalStore`. Visual rules live in `src/styles/game-ui.css`, phone allocation in `src/styles/portrait.css`; `src/android/mobile.css` imports the shared layout. Root-specific theme selectors cover lazy-loaded dialogs while retaining the absolute/fixed positioning of overlay controls. As of 2026-09-28, `main` includes Android 0.4.5 and the shared web design system; the earlier web release remains available in Git at `118cf49`. See [UI_SYSTEM.md](UI_SYSTEM.md).

`mobile/index.html` and `src/android/main.tsx` are built by `vite.android.config.ts` into `dist-android`, then packaged by Capacitor 8 into `com.rainbowlion.fogtrpg`. Android 7 / WebView 110 minimum, compile/target SDK 36, JDK 21, AGP 8.13 / Gradle 8.14.3. The web entry and its CSS remain independently buildable.

`src/platform/storage.ts` supplies the shared storage port (browser defaults to localStorage). Android installs an ordered, retryable cache backed by application-private AES-GCM data with an Android Keystore key. `flushGameStorage` is required before successful save/configuration confirmation. Backups are disabled. `src/android/session.ts` persists state plus locked dice presentation; hydration applies scenario checks, removes stale thinking state and preserves pending actions for retry. Consistent issued-check thresholds survive rule updates so locked rolls retain their result; future checks use current skill totals. API credentials are not synchronized with the web edition.

`src/dm/llm/transport.ts` injects the Android HTTP implementation below the existing LLM HTTP/client/adapter layers. `AiTransportPlugin` uses OkHttp with 20-second connection / 180-second call limits, a 4 MB response cap, real cancellation and preserved status codes. Redirects and TLS verification bypasses are disabled. Player-configured HTTP gateways are supported; HTTPS remains the provider default. Game business modules still cannot directly invoke endpoints or protocol fields.

The mobile stylesheet adapts viewport allocation, keyboard resizing, touch targets, menus and dice layout. Native lifecycle events pause audio and flush storage; system back handles the active modal, drawer, menu or title exit. Android optimization converts PNG art to bounded WebP without editing original assets. Android Vite disables `.env` loading and ignores web `VITE_AI_*`. In 0.4.10, the user's explicit request permits APK-only default MiMo configuration: the build script temporarily reads `APIKEY_MIMO` from process/user/machine environment; `androidBuildDefaults.ts` validates Token Plan credentials/official regional URLs and defines provider/protocol/model/base/key only for a build. Serve mode stays blank. Saved configuration wins. Real keys and generated bundles stay outside Git. Signing keys remain persistent outside Git; see [ANDROID.md](ANDROID.md).

The Android entry applies `html.android-app` and `html.portrait-ui` before rendering. Every mobile override uses `portrait-ui` so shared component CSS loaded lazily cannot restore desktop sizing, including body portals. Safe-area variables and `100dvh` bound the app and dialogs; explicit `minmax(0,1fr)` / `min-height:0` allow reading and content regions to shrink. Setup has fixed top navigation and a bottom selected-count/start footer, with scrolling single-column cards and inline expanded attributes. Portrait tablets retain the same single-column selection, capped at 720px and centered. API, audio, journal and entity bodies have separate scroll containers while action/close controls stay outside. API fields and audio channels stack vertically. Entity details place artwork above independently scrolling text. The archive uses a one-column list on phones, two columns on wider tablets and a bounded graph workspace above 900 CSS pixels. Mobile archive details join the existing dialog focus stack so Android Back closes the detail before the archive. No global zoom or physical-resolution scaling is applied.

Android 0.3.1 requests `screenOrientation="portrait"` and retains `adjustResize`. The game grid contains navigation, a scene stage, a flexible narrative row and an automatic action row. All current scene art is 1896×1080; stage height is `min(100vw * 1080 / 1896, 50dvh - navigation height)`. The stage spans the viewport width below navigation, independently of the full-screen narrative container. Backgrounds use `object-fit:contain` to preserve the whole painting; on wide windows the half-screen height cap takes priority over filling the frame. NPC artwork fits inside the same stage with a soft bottom fade and never overlaps the narrative. The scene remains visible without an NPC. As of 0.4.2, expanded reading spans the scene and narrative rows (2–3), hiding the stage while preserving navigation. Heights up to 500 CSS pixels reclaim the stage, and up to 300 hide auxiliary navigation/status to preserve input. Breakpoints use width/available height instead of CSS orientation, because a keyboard can make a portrait viewport wider than it is tall. `CharacterSetup` has an opt-in portrait footer, always enabled by `AndroidApp` and enabled by the web entry at widths up to 700 CSS pixels. Wider web windows keep header actions. No gameplay, save schema or AI protocol changes are required.

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
| `setup` | Select 1-4 preset investigators; initial selection contains only the first preset (Henry) |
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
  currentActorIndex,
  declarations,
  pendingCheck,
  currentScene, // canonical location shared by the whole party
  activeNpcName,
  clues,
  flags,
  actionLog,
  conversationHistory,
  messages,
  suggestions,
  isThinking,
  longTermMemorySummary,
  summarizedTurnCount, // formal rounds removed by accepted summary compaction
  pendingDmActions, // resumable actions and locally confirmed roll metadata
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
| Skill base values such as `EDU` and `DEX÷2` | `resolveSkillBase(base, attrs)` |
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

Save ids are monotonic, including saves in the same millisecond. Storage failures surface to the player. An unfinished AI response persists its actions and confirmed dice metadata in `pendingDmActions`; loading enables manual retry without another declaration or roll. Saving is blocked during an unconfirmed dice animation/result. Optional `summarizedTurnCount` preserves formal round numbering across compaction; older saves default it to zero without fabricating missing history.

AI settings persist to browser storage first. Development can additionally write managed keys to `.env.local`, preserving unrelated comments and quoting. The local writer accepts same-origin JSON with validated single-line values and a 16 KB limit. App-managed env writes do not reload the current game; other browsers pick them up after the next server start.

Save payload version `8` records `moduleId`, `moduleVersion`, `contentHash`, and authoritative `ScenarioProgress`. v1-v7 saves migrate deterministically from scene, clues, flags, and event history; S04/S05 migrations never replay entry SAN, encounters, or rewards. A content hash mismatch without a module migration is rejected. v7 case-board migration remains deterministic and does not call a model.

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
5. The retry response goes through the same strict/local pipeline. A format failure permits one final fresh pipeline attempt with `narratorAttempts: 1` (at most three normal Narrator attempts overall, excluding tool lookups or protocol capability negotiation). Persistent failure retains the round and offers manual retry. Raw malformed JSON/Markdown must never be appended as player-visible DM narrative.
6. Only Narrator contract/semantic errors and `AiResponseFormatError` enter this repair loop. Failed fetches and interrupted response bodies become `AiConnectionError`; provider HTTP failures retain their status in `AiHttpError`, including non-JSON gateway errors. Authentication, permission, rate-limit and service failures receive distinct hints. Transport/HTTP/configuration/protocol errors and cancellation never trigger format repair or disable tools. The original declarations and confirmed dice remain available for manual retry.

### Narrative Markup And Safe Details

Authored story-event `narrativeCue` text is DM guidance, not a standalone transcript message. Reducer settlement retains authoritative event IDs and state effects without appending these summaries. The DM receives the last six settled event cues as continuation context, with an explicit instruction to narrate perceptible outcomes naturally rather than copying internal summaries. Actual HP/SAN deltas, dice results, endings and operational errors remain player-visible. A shared visibility filter removes legacy system-message cues both on hydration and in an already-running transcript; player and DM narration is preserved even when its text matches a cue. The player log hides internal event IDs and progression instructions while retaining the underlying records.

`src/services/narrativeMarkup.ts` builds immutable text segments; React renders those segments directly and never uses Markdown, model HTML, or `dangerouslySetInnerHTML`.

- Deterministic terms come from investigators, public NPC aliases, public scene aliases, authored items, visible dynamic case-board titles, skills, check difficulty/results, HP/SAN, and curated states.
- Optional Narrator keywords only supplement emergent clue/danger/state language. Deterministic entities win every overlap; otherwise longer terms win.
- Person colors are derived from canonical names with a stable hash and palette collision resolution. The same map is used in message text, player labels, and the active-NPC nameplate.
- Every mark opens `EntityDetailModal`. The resolver may show only public authored information, already unlocked secrets, current investigator values, rule explanations, or the original sentence for an LLM hint. It never exposes locked secret contents or counts from narrative navigation.
- DM messages may use their stored keyword hints. Player and system messages run deterministic markup only. Old saves without keywords still receive deterministic markup after hydration.
- The modal uses dialog semantics, supports Escape, and restores focus to the invoking control.

### Dice Presentation

- `DiceRollOverlay` uses the supplied art in `assets/ui/dice/`; `src/styles/dice.css` contains its isolated layout, 40% black backdrop and 4px blur. All text uses the full `assets/fonts/zihun-yunquesong.woff2`. The result slot displays one full grade title, without a second generic success/failure image; the dice show digits without tens/ones captions. Original font license metadata is retained in the WOFF2 and documented in `assets/fonts/README.md`.
- `handleRoll()` locks one frontend D100 result immediately. A 30-frame transparent WebP atlas plays at 12 fps using CSS; `DICE_ROLL_DURATION_MS = 2500` controls both the animation and the existing wall-clock reveal deadline. No presentation randomness or media callback can reroll or settle the result.
- Reduced motion uses static blank dice. A pending or failed atlas download keeps the static fallback visible; neither asset loading nor animation completion blocks reveal. Once revealed, total and faces derive directly from the locked result (100 = `00 + 0`).
- Results remain visible until confirmation. The shared dialog focus guard traps Tab, ignores Escape while rolling, and permits Escape to confirm only after reveal. Each multiplayer check shows its queue index; the final confirmation continues the existing aggregated AI settlement.

### Foreground And Background Lifecycle

`runDmTurn()` has one foreground result and one optional `backgroundUpdate: Promise<DmBackgroundUpdate>`:

1. Foreground waits only for ContextBuilder, Narrator, Director, and StateResolver.
2. The controller immediately applies narrative, accepted events, checks, and suggestions, then clears `isThinking`.
3. Summary and System2 run concurrently in the background. Fact extraction runs before dynamic case board synthesis and episodic memory construction.
4. `DmTurnCoordinator` applies completed background updates in invocation order. `DmTurnOutput` does not expose a duplicate `deferredUpdates` path.
5. Every LLM request receives the turn's `AbortSignal`. A 180-second task timer is cleared on completion.
6. New game, restart, save load, return home, component unmount, or timeout invalidates the session, aborts active fetches, and prevents stale foreground or background writes.
7. Background failures are soft failures and do not retract a valid Narrator result. Invalid or empty Summarizer JSON is discarded rather than stored as long-term memory.
8. Aborting also settles coordinator waits when a provider ignores its signal, so an obsolete background promise cannot block later updates forever. Summary compaction is accepted only while its exact source history remains a prefix; removed formal rounds accumulate in `summarizedTurnCount`.
9. The pending player turn is omitted from prompt history because the action payload already contains it. Check preludes do not decay intents/consequences or run cognition; final settlement advances them once. Background case-board context projects newly unlocked authored clues and flags.
10. Reducer actions receive one `randomSeed` from the controller. Authored random rewards reuse it during React replay and dice continuation projection. SAN checks read current sanity, attributes resolve by Chinese/English name, and skill punctuation/whitespace is normalized.

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

Each party round submits multiple player declarations in one AI turn. When the AI DM judges that player demands conflict materially, it must follow this sequence:

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

### Scenario Runtime Contract

The five YAML files under `scenarios/wuzhongxiaoshi/` are the only authored scenario source. JSON Schema rejects unknown fields. `scenario:validate`, `scenario:build`, `scenario:docs`, and `scenario:check` validate references/assets/reachability, generate runtime TypeScript and types, and verify generated files are current.

`ScenarioProgress` owns beats, objectives, known facts, clue discovery/analysis/destruction, declared variables, world time, clocks, encounters, fired event ids, and ending state. Every `once` event is idempotent. Scene travel requires both a spatial exit and its Condition. Required beats issue an authored soft hint after three idle turns and execute fail-forward after six.

The AI may propose only an authored `eventId` through `propose_story_event`. Director verifies the event belongs to an active beat and its Condition is true; effects are loaded exclusively from YAML. Direct writes to declared story variables or authoritative clues are rejected.

An explicit player declaration may also create a deterministic `propose_story_event` candidate for the same Director review, preventing a tool-omitting model from discarding clear intent. Narrator semantics are reviewed at three levels: authoritative state or safety conflicts are blocking, clear quality regressions are advisory, and ordinary style/detail findings are warnings. Advisories and warnings are accepted immediately and retained only in developer diagnostics. Repeated blocking conflicts and unparseable JSON surface as format errors for bounded controller recovery. The pipeline never replaces a semantic failure with locally authored player-visible narration.

### Dynamic Case Board

The case board is not a free-form AI UI surface. v7 is a mixed investigation workspace with three data responsibilities:

- Static scenario spine generated from `scenarios/wuzhongxiaoshi/presentation.yaml`, used for stable main clues and authored relationships.
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

Dice presentation rules:

- `useGameController` computes the authoritative D100 result exactly once before starting the presentation and blocks duplicate roll input while it is active.
- `DiceRollOverlay` first shows approximately 1.25 seconds of visual-only face cycling, then approximately 1.05 seconds of the locked result. Cycling values never enter game state or the AI request.
- Only after the reveal finishes does the controller apply the result, append the user-visible roll message, and start the AI continuation turn.
- Starting or loading a game, returning home, restarting, or unmounting invalidates timers so a stale reveal cannot mutate another session.
- The overlay supports narrow viewports and `prefers-reduced-motion`; the settled die faces are rendered directly from the authoritative result.

## 10. Story Data Contract

`src/data/storyData.ts` contains one bundled module:

| ID | Scene |
| --- | --- |
| S01 | 摩勒住宅 |
| S02 | 上城区第二分局 |
| S03 | 老赫特酒吧 |
| S04 | 卡森其药店 |
| S05 | 泰晤士港 |

Story data also includes 5 NPC entries and 8 item entries. Assets are imported directly by Vite from `assets/`. The title uses a 458 KB VP9/WebM conversion of the original 50.45 MB GIF; playback pauses on hidden pages and reduced-motion preference. The case board loads only when opened. Dialogs contain keyboard focus, support Escape, and restore their opener.

## 11. Known Technical Limits

### Audio presentation

- `src/audio/AudioDirector.tsx` observes the visible screen/scene, settled ending and dice presentation; it does not dispatch game actions, inspect secret flags, or determine results.
- `AudioEngine.ts` lazily creates Web Audio on trusted interaction. Separate music/effects gain buses support immediate mute. Music/ambience loops crossfade over 1.8 seconds, dice roll sound stops at reveal. Same-track scenes keep playback; delayed obsolete loads and transient effects are discarded.
- Visibility/page lifecycle listeners suspend hidden playback and resume the current loops. Teardown/HMR releases sources, gain nodes, decoded buffers and the context. Missing audio or unsupported Web Audio does not block gameplay.
- `trpg-audio-v1` stores independent enabled flags and volumes, with type validation, 0–1 clamping and storage failure tolerance. Defaults: music 0.30, effects 0.55; environment gain additionally 0.45. Saves and AI requests never include these settings.
- `AudioSettingsButton` opens a portal dialog with focus containment, Escape/return focus, accessible switches/sliders, a dice preview and visible CC BY 4.0/CC0 credits. It is available on title, setup and the game menu. Setup uses an icon-only 44px button beside the start action, with a tooltip and accessible name; its header shares the character grid width and keeps the title centered.
- `assets/audio/` contains 12 locally bundled MP3 files (2.82 MiB); 60-second music and 20-second environment loops are decoded on demand. `scripts/build-audio.py` regenerates them from the documented sources; no runtime CDN or audio library dependency.
- Audio tests cover muted/late downloads, A→B→A scene races, autoplay recovery, background suspension, disposal, independent persistent settings, real-browser decoding/levels/seams, narrow screens and 1/2/4-investigator navigation.

### Remaining limits

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
- Default solo selection, replacing the investigator, and rejecting an empty party; one-, two-, and four-investigator action/D100/AI/save-load flows. Party tests explicitly select additional investigators.
- Investigator setup shows four portraits and full attribute blocks.
- Submitting actions without an API key opens AI settings instead of crashing.
- Saving a game enables "continue latest save" from the title screen.
- Save Manager can list, load, and delete explicit save slots.
- Invalid save payloads are ignored on the title screen.
- Fullscreen reference panel renders the v7 investigation workspace and deterministically migrates v6 dynamic hypotheses.
- Narrator becomes visible before background cognition completes, and abandoned-session responses cannot write into a restarted game.
- D100 rolls `96-100` are fumbles before success thresholds.
- Rules config tests verify derived stats, skill base formulas, difficulty thresholds, and fumble range stay centralized.
