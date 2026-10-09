# TabletopRPG PRD

> Version: v0.9
> Updated: 2026-10-09
> Product baseline: Vite + React + TypeScript MVP

0.5.4 修复网页资料入口在缩小窗口后越界，以及桌面短窗口裁掉行动区的问题。低高度先让场景与建议让出空间，保留正文、长行动和确认；极短窗口可从头像查看整队。拖动不误打开资料，恢复大窗口接回场景/队员，手机固定入口及竖屏布局保持。

0.5.3 修复输入法组字时 Escape 误关弹窗、Tab 误跳焦点的问题；取消或选择候选字由输入法处理，未保存设置与游戏草稿保持。普通关闭、焦点循环及嵌套返回沿用，保留 0.5.2 精绘美术。

0.5.2 按原稿风格精绘七类专用资源：骰子命运面板、银蓝档案阅读框、透明立绘装裱、深色输入槽、方形工具底板、标题分隔线和珠光推子。首页原标题与金/蓝按钮保留，全部生产界面使用实际压缩图；层次和装饰集中在边缘，文字、立绘与触摸区域独立。骰子保留原骰面和字体，点数区、舞台及唯一结果签牌各有安全区，小屏/短窗口保持可读与可确认。新素材不添加文字、人物、模型限制或操作步骤。

0.5.1 将安卓连续行动输入的自动保存合并到最长 250ms 的有界窗口，内存续玩立即使用最新草稿；提交、换人、手动存档、返回首页、重新选角、切到后台、页面离开和退出立即保存最新内容。完整历史、多人草稿和锁定骰点保留，存储格式与加密方式不变。强制杀进程且未收到生命周期通知时，最多一个尚未写入的输入窗口可能无法恢复；不把异步保存描述成绝对零丢失。骰子揭晓沿用已加载的静态骰面，避免替换图片时短暂空白，原计时和确认逻辑不变。

0.5.0 按用户指定的 `D:\首图素材（这版为准）` 全面替换共享 UI。首页直接使用美术成稿的冷蓝伦敦雨雾、原比例白蓝标题、金色新游戏和浅蓝继续/设置；原稿未提供的阅读面板、方形工具底板按同一风格补齐。手机竖屏优先，网页沿用同一套控件、字体和状态，覆盖选角、剧情、行动、调查员属性、资料、案件、设置、存档、检定、恢复和结案。

默认单人、一行一卡、完整场景与 NPC、固定顶部/阅读上限、头像属性、多人草稿、多行行动、读档选择记录与首页一键继续保持。窄手机四人加长输入仍保留至少 140px 剧情和全部队员入口。菜单、关闭、确认和主要操作可在输入法占位时到达；正文不被装饰抢占。旧黄铜/皮革与古铜骰子面板退役，原骰子、字体、场景、配乐和剧情保留。视觉重构不新增模型请求、叙事限制或存档格式。当前规范与对照证据见 [UI_SYSTEM](UI_SYSTEM.md)、[重构计划](plans/2026-10-09-artist-ui-rebuild.md) 和 [design-qa](../design-qa.md)；以下旧版本段落记录当时行为，视觉以 0.5.2 精绘素材及当前规范为准。

0.4.20 结案后保留本次结局、队伍属性入口，并可直接打开「调查回顾」或返回首页。手机只显示两行结案摘要，完整原文在进度页；固定操作与 1–4 人状态条不压住剧情阅读，短窗口收起摘要/状态条。首页的已结案记录明确使用「回顾调查」，回看不重新请求 AI 或结算奖励，安卓版无需配置模型即可查看已有结局。普通「资料」仍从案件板打开，关闭回到实际入口。原结局、奖励与存储格式不变。

## 1. Product Positioning

Version 0.4.39 retains decoded long audio only for the current soundscape, playing tracks and unfinished crossfades. Finished inactive tracks and obsolete downloads are released; short effects remain reusable. Returning during a fade reuses the existing buffer, and revisiting a released track decodes the locally bundled file. Device recovery still resumes current enabled loops without another tap, while delayed short effects are discarded. Background silence, independent mute/volume preferences, gesture-based startup and existing scene transitions remain intact.

Version 0.4.32 gives case search and type selection the existing illustrated brass frame, with 16px input text, 15px hypothesis actions and a full 44px clear-search target. Dossier type labels use 13px text and identities/relations 14px, retaining 17px names and original photographs. Phone archives omit the repeated count summary, keep the accessible heading, and scroll records beneath fixed controls. Known sources, filters, relation return, drafts and the party remain usable. The APK continues to exclude unused desktop graph files; web graphs still load on demand and fall back to these dossiers if they fail. No narrative, visibility or gameplay rules change.

Version 0.4.29 keeps action restoration and window changes free of recursive resize errors. Changes in the input wrapping width are refitted once after observation delivery; typing and viewport height changes retain their existing immediate fitting and size limits. Drafts, turn order, retry requests and input focus remain unchanged.

Version 0.4.28 gives party resources the existing illustrated dossier frame. Names use 14px type, HP/SAN values 13px and labels/action status 12px, with at least 44px targets. Submitted investigators remain fully readable and open the same live dossier without changing the acting player or draft. HP and SAN wrap as complete label/value groups; phone teams use two columns, with four only on wider native portrait windows. Narrow multiline declarations retain every party card and the existing minimum reading area.

Version 0.4.27 keeps brief save feedback below the pinned top bar, leaving HP/SAN and actions visible. Feedback uses the existing drawn dossier, readable 15px text and a stable polite live region; longer notices stay for four seconds. Expanded story feedback uses the space before the toggle, keeping the NPC nameplate readable. Saving AI settings simply confirms that they are saved. Multiline declarations reserve their full action/party height before the painting yields space, on phones and desktop; viewing a party member during feedback does not lose the draft.

Version 0.4.26 gives pending checks and preserved turns one compact drawn dossier strip. Player/check titles use 16px text, instructions and actions use 15px, and roll/retry controls remain at least 44px. Full text wraps within the available space, preserving story reading and every party card at normal phone heights. Desktop also hides the unavailable declaration row during these stages, then restores it when the turn becomes editable; drafts and turn resolution remain intact.

Version 0.4.25 makes AI settings repairable on a phone: saving an incomplete connection identifies and focuses the relevant field, with a concise message beside it. An invalid service address opens its collapsed connection section; unrelated sections stay as the player left them. Field content scrolls within the dialog when the keyboard reduces space, while close and save remain fixed. Labels, feedback and footer actions use at least 15px type. Existing connection requirements, stored-player priority and APK defaults remain unchanged.

Version 0.4.24 gives the current web edition the same optimized art as the APK. Scene composition and transparent portraits remain intact; images keep their aspect ratio and never upscale. Both builds share one regenerable cache while original masters remain available. Seven unreferenced dark scene copies are removed, as the existing scene shade already supplies darkness. This changes loading cost and generated-file retention, not the story, UI layout or older web revision in Git.

Existing saves and automatic sessions restore authored investigator portraits from the current build when their previous bundled URL has expired. Current resources, learned skills, declarations and locked dice remain intact; explicit custom images remain unchanged. Players can continue after an update without rebuilding their party.

Version 0.4.23 reduces repeated work when typing alongside a long story. Each panel render prepares its known terms and person colors once for the entire visible history, then rebuilds them from the full current state on the next render. Complete prose, colors, per-message AI hints, known-information boundaries, detail actions and reading position remain intact. No history truncation, additional narrative restrictions or new player-facing settings are introduced.

Version 0.4.22 makes the story header's NPC dossier, reading toggle and temporary new-content action 44px illustrated controls. NPC names use at least 14px type; a narrow phone with new content prioritizes the name and actions over the repeated role tag. Opening a known NPC record returns to the same header and reading position. The header stays outside the story scroll without adding a toolbar row, artwork or narrative behavior.

Version 0.4.21 gives sound controls the existing illustrated dossier and brass surfaces. Close, switches, faders, preview and credit links have 44px targets, with 15px channel and credit text. Only the channel/credit body scrolls, so the close action remains available on phones, desktop and short windows. Independent live volume/mute preferences, source attribution and original music/effects remain unchanged; returning from nested sound settings keeps the current action draft. A newly arriving reply also respects an already changed reading position before the browser's scroll event is delivered.

### Android companion build — 2026-09-09

Version 0.4.37 refines the illustrated investigator sheet without new images. Phone resources use two columns with readable 14px labels and upper limits; current values remain 22px, attribute abbreviations 12px, and teammate/tab actions 15px with 44px targets. Skill and background text remain 15px. Clearing a skill search returns to the list start and keeps typing focus. Tabs retain their reading positions during the same visit; comparing another investigator preserves the query but starts the new record at the top. A keyboard-reduced phone layout keeps teammate switching available and leaves a usable skill body. Live statistics, difficulty thresholds, possessions, turn order and drafts are unchanged.

Version 0.4.18 makes the current investigation reachable from Home even without a manual save. Continue becomes the primary action, with a compact dossier showing only the current scene, party and story time. Returning home or cancelling character selection retains drafts, the acting investigator, submitted declarations, pending turns and locked dice; only actually entering a new investigation replaces it. Web navigation retains this checkpoint within the open page, while a fresh page still loads a manual save. Android updates its live continuation before disk writes settle, so pending or failed persistence cannot send the player to an older session; write failures still report the actual storage problem. No extra confirmation or AI request is introduced.

Version 0.4.17 gives progress and action logs the existing illustrated dossier surfaces and readable 15px body text. Current objectives lead, past objectives expand on demand, and an ended investigation opens its review. Zero clue statistics disappear; authored visible clocks show their real labels and values. Log search finds known text or time in the existing latest-first order, retains the query and reading position between tabs, and clears on leaving the archive. Only the log body scrolls below fixed controls, including keyboard-reduced layouts. Internal diagnostics remain excluded and game/save/AI rules stay unchanged.

Version 0.4.16 keeps the fixed phone information icon a normal tap target: a small finger drift no longer swallows the tap or leaves a dragging state. Desktop keeps optional vertical repositioning through local pointer capture; release, cancellation and switching to phone layout reset the gesture, while keyboard activation remains available. Obsolete manual case-board styles are removed without adding assets or changing known information.

Version 0.4.15 keeps the desktop relationship graph readable when details open or filters change: the selected record and nearby context fit the actual pane, closing details restores the player's previous view, and ordinary browsing does not undo manual pan/zoom. The graph reuses the same photographed dossier art as the phone archive, with Chinese 44px zoom and overview controls. Phone and native portrait continue to use the compact archive without constructing the graph; no additional bitmap resources are introduced.

Version 0.4.34 presents entity and case details as photographed dossiers with existing illustrated photo corners, fixed identity/close controls and full scene paintings. Roles, relationships and record metadata use 14px text; section headings, known prose and sources use 15px. Sources expand through a 48px illustrated brass control with a clear open/closed arrow. Related known records open directly and can return without changing list filters or action drafts; phone system Back first returns within a chain, while desktop Escape closes the detail and leaves the archive open. Sources fold by default and undiscovered-secret counts stay out of the UI. Desktop graph records are native buttons with Enter/Space activation. Original images, reviewed facts, player state and the free-action loop remain intact.

Version 0.4.13 bounds local delivery growth: a successful, verified release retains the two latest APKs and checksums, pruning older named packages and install/alignment scratch. A failed checksum cannot remove the previous delivery, and rebuilding an older version preserves newer releases. Finished audio source downloads and WAV intermediates can be removed with the maintenance command while runtime audio, provenance and licenses stay in place. The existing title video gains a small matching static poster; obsolete GIF and SVG presentation references use the current art instead.

Version 0.4.12 turns phone case records into photographed dossier cards, using existing NPC portraits, complete scene images and quiet type/relationship labels. It removes duplicate counters, zero-only summary fields and the script's undiscovered clue total. Archive tabs, search and filters stay above the independently scrolling records; search can be cleared without losing typing focus. Phones and every native portrait width use the archive, loading the desktop graph and layout worker only when a wide web view needs them. Resizing keeps the query/type and clears an unavailable thread filter. Details retain the existing known-information and reviewed case-board data boundaries.

Version 0.4.38 retains 24 atmospheric waiting captions, shuffled for each DM wait and rotated every eight seconds without repeats within the cycle. Caption changes keep one stable accessible status, readable 15px text and unchanged story height; completion cancels the timer. Corrupt Android automatic-session errors show a brief recovery message while preserving the original record and independent manual saves. A damaged encrypted record is isolated without deletion so other healthy records remain available; device/key access errors still use the existing startup retry. Durable flush waits for updates or removals that join while saving and reports their failures. The exit sheet describes leaving the app, keeps its actions fixed and ignores repeated exit/dismissal while pending; failure remains inline and retryable. No model prompt, story, dice, reward or storage-format change.

Version 0.4.35 uses one in-game Load Save entry: it opens the record list and restores only the chosen save. Closing leaves the current draft and actor intact; the title Continue action keeps its one-click continuation. The existing dossier and brass artwork frame the list and exit/confirmation controls. Dates and party names use 14px, actions and confirmation use 15px, and phone parties of three or more stack portraits above complete names. This version presents local saves as compact investigation records, with scene, time, party portraits and a single load action. The list scrolls independently while the title and exits stay visible on phones and desktop. Deletion asks within the selected card, defaults focus to Keep, and waits for persistence; cancellation keeps the save. Failed native writes restore the previous library, repeated save taps do not create duplicates, and compatibility notices omit internal hashes and migration diagnostics.

Version 0.4.10 lets new APK players start with the user-authorized MiMo Token Plan default, using `mimo-v2.6-pro`; their own saved connections still take priority. Provider compatibility retains private reasoning and real tool calls without exposing technical diagnostics. Dodge now starts at half of percentile DEX, preserving authored allocations, saved investments and locked rolls. Switching teammates keeps the skill search for easy comparison.

Version 0.4.42 gives suggested actions the existing illustrated dossier material, 14px text and 44px targets; Submit/Next uses 15px text and a 48px target. Component-scoped rules replace older global/phone sizing overrides. Suggestions are deduplicated locally before their existing limits, retaining the first occurrence and each player’s own choices without retries or invented actions. The phone hint is compact; actor identity stays in the avatar, party and accessible field name. It supports multiline actions on phones: Enter inserts a newline and the explicit Submit/Next button confirms. The field grows within a compact limit and scrolls for long descriptions; switching to the next investigator retains typing focus. Desktop keeps Enter confirmation and Shift Enter for a newline. Multiplayer cards identify the current and completed actors while declarations are open. Reading older story entries keeps its position when a reply arrives, with a small new-content action to open the latest reply from its beginning; internal diagnostics do not move or badge the story.

Version 0.4.7 makes primary actions tangible brass plates with dark lettering and gives investigator selection its own illustrated dossier mount. Cards prioritize identity, two strongest non-language skills and core resources; full attributes, skills and background expand in the list. Native checkboxes keep selection independent from details. Both phone and desktop keep the party summary and entry action outside the scrolling list, retaining the default solo and explicit 2/4-player flows. See [UI polish verification](reviews/2026-10-08-ui-polish.md).

Version 0.4.40 groups the investigation menu into records, settings and navigation, with 14px group labels, consistent 15px operation text and 48px operation/resume targets. Component styling keeps the footer size stable regardless of shared phone-style load order; close/resume actions remain fixed with proper nested-dialog return behavior. AI setup prioritizes provider, key and model, folding only the default official connection; custom/saved gateways remain explicit. Fresh setup avoids premature errors, key reveal is temporary, and keyboard resizing scrolls fields without displacing the header, feedback or save action. Editing and dismissal wait for an in-progress storage write. Existing game rules, AI protocols and save contents are retained.

Version 0.4.6 fixes strict API schema compatibility and false checks caused by negated or future instructions. A partially supplied multiplayer check batch now retains every explicitly requested player/skill. Truthful failed-roll narration is accepted without retry; prose-quality suggestions stay in developer diagnostics rather than causing another foreground generation. KP notes are removed from the player menu, provider errors become short actionable hints, and dice records identify the investigator and skill without repeating the roll number.

Version 0.4.5 reduces false rejection of free roleplay. Local improvised props, traces and habits no longer require an authored story event. Accepted narrative continuity and explicitly unconfirmed player guesses can mention locations without unlocking or entering them. Negative, future and retrospective check wording does not demand a roll; an unambiguous current DM instruction can recover a missing check tool through the usual Director validation. Bounded automatic recovery retains its last correction, and failures appear once in the action dock without exposing rule diagnostics or hidden names. Dice, numeric state, formal clues and mainline outcomes remain authoritative.

Version 0.4.4 keeps one investigator per row throughout portrait selection, including phones reporting 600 or more CSS pixels and portrait tablets. Each card keeps artwork beside readable information; wide lists are centered and capped at 720px. Selection count and start remain fixed below the scrolling list, and expanding attributes preserves the selected party.

Version 0.4.3 makes the action avatar, every party status card and player names in the story open a complete investigator dossier. Players can inspect live HP/MP/SAN/luck, eight base attributes, searchable skills with all three check thresholds, recorded equipment and background. Inspecting teammates never changes the active turn or draft. Identity, close and tabs stay outside scrolling content; Android Back, keyboard focus return and keyboard-reduced layouts are supported.

Version 0.4.2 bounds expanded reading below the chapter/location bar and above the action dock. The NPC/title and collapse control stay outside the independently scrolling story, so long histories cannot cover either header. This applies to the APK and new web build, with regression coverage for small phones, multi-player histories and desktop navigation.

Version 0.4.1 applies the artist-supplied game icon to Android launchers, system splash and web favicons. Adaptive masks retain the full symbol, older launchers receive density-specific PNGs, and supported themed launchers receive a monochrome layer.

Version 0.4.0 adds a complete investigation-themed interaction system shared by the APK and new web build. Aged brass plates, dark leather surfaces and file tabs replace generic rounded controls. Primary/secondary actions, icons, suggestions, cards, forms, toggles, faders and dialogs share explicit selected, pressed, disabled and keyboard-focus states. APK and web viewports up to 700 CSS pixels share the portrait structure; wider web layouts retain their space with the same visual system. Art must not obscure text or reduce access to actions. See [UI_SYSTEM.md](UI_SYSTEM.md).

As of 2026-09-28, the Android edition through 0.4.5 and shared web improvements are integrated into `main` with user approval. Web and APK retain separate build entries; the earlier web release is preserved in Git at `118cf49`. The APK reuses the same investigation, rules, art, audio and 1–4-player hot-seat game, adding portrait touch layouts, system back, encrypted settings/saves and session recovery. The user changed the API policy on 2026-10-08: release APKs now bundle an environment-supplied MiMo Token Plan default with `mimo-v2.6-pro`, allowing first-time players to start without configuring a connection. Saved player connections take priority and remain editable. Real credentials must stay outside Git and the web build. AI turns require an online service; local assets need no desktop server. Release packaging and checks are defined in [ANDROID.md](ANDROID.md).

Android 0.2.1 treats short landscape viewports as the primary UI target. At 560×280 through 960×432 CSS pixels, navigation and dialog close/save controls must remain reachable; long cards, archives and descriptions scroll in their own content areas. The action input and submit control remain reachable with 180 CSS pixels of keyboard-reduced height. Investigators default to one, with explicit 2/4-player coverage. Layout acceptance includes screenshots and clipping/touch-occlusion checks in the actual APK; desktop tests alone are insufficient.

Android 0.3.0 replaces the landscape interface with a portrait layout. NPC art occupies a separate upper stage, the narrative scrolls in the middle, and actions stay at the bottom. Body text is 15 CSS pixels and primary input/submit targets remain at least 44 pixels high. Selection uses a vertical card list with a persistent selected count and start footer; multi-player status uses two columns. API forms, audio, dossiers, archive cards, saves and dice all have portrait layouts. Expanded reading and keyboard-reduced windows reclaim the stage. Acceptance covers 320×568 through 600×960 CSS pixels, including 1/2/4 players, locked portrait orientation, no clipped controls and keyboard-reduced input.

Android 0.3.1 fits the entire landscape painting into a dedicated upper frame that spans the phone width at its original aspect ratio. It no longer crops the background against the full portrait screen. The stage stays within the upper half, remains visible without an NPC, and keeps the narrative and actions below it. Scene-fit acceptance checks all five active scene images and phone layouts with 1/2/4 players.

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
