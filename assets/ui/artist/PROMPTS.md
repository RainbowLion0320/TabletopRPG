# 采用 UI 图的实际提示词

## action-pen.webp（0.5.21）

一次生成：`exec-44d292d9-78d5-435f-be96-bc699eadd749`，2026-10-10。内置 Image Gen，无参考图和后续编辑，原生透明度保持；原 PNG 保留于本机生成目录，不提交。

```text
Use case: stylized-concept. Asset type: one transparent painted raster game UI icon for the action submission button in a 1920s London mystery tabletop game. Primary request: a beautiful compact FOUNTAIN PEN, one complete pen only, replacing a generic chat-paper-plane symbol with an object that expresses writing an investigator's action. Finely hand-painted navy-blue lacquer barrel, brushed-silver fittings and an elegant silver nib, with only a restrained muted-gold collar and paired tiny pearl rivets. Broad readable silhouette, slightly elevated diagonal view: barrel at upper left and exposed nib pointing down toward the lower right, nib is about one quarter of the object length. Keep the whole pen centered and contained with generous real transparent margin, occupying about 80 percent of the square canvas diagonal. Clear dark-ink outline against pale blue or pale gold buttons, silver highlights stay controlled. Two-dimensional painted inventory-game-art quality; tactile but visually simple enough to recognize at 20 to 24 pixels. Match cold midnight-blue cloth-and-paper UI with layered silver details and cool ivory highlights, no warm bronze leather theme. Actual native RGBA transparency outside the pen, no surrounding glow or ground shadow, no scene background or checkerboard painted into pixels. No writing, letters, labels, numbers, paper sheet, book, hands, extra objects, outer frame, complete UI or button. This is a generic interface pictogram and adds no story prop or player instruction.
```

## journal.webp（0.5.19）

一次生成：`exec-b71d7d2b-adf5-48e8-b331-e9329e0064de`，2026-10-10。内置 Image Gen，无参考图和后续编辑，原生透明度保持；原 PNG 保留于本机生成目录，不提交。

```text
Use case: stylized-concept. Asset type: one production transparent raster UI icon for the investigation records and review buttons of a 1920s London mystery game. Primary request: a carefully hand-painted OPEN INVESTIGATION JOURNAL icon, matching a cold navy-blue and silver illustrated game UI rather than a flat web outline. One open book only, centered, clear two-page silhouette and dark navy cloth covers with gently curved ivory-blue blank pages. Fine layered silver page edges and two small paired pearl rivets on each cover corner, one restrained muted-gold bookmark at the central fold. View from slightly above, balanced and symmetric, covers visible beneath the pages. Dark ink-blue outer contour gives excellent readability on pale-blue button faces; pages remain light and simple. Restrained paper and cloth texture, clean painterly shading and highlights, premium small game inventory illustration. Square canvas, book fills about 78 percent of width, all corners fully contained, generous truly transparent outside margin. Actual transparent alpha background, no surrounding glow, fog, ground, drop-shadow rectangle or drawn checkerboard. Absolutely no writing, letters, numbers, symbols on the blank paper, no plot objects or new story facts. No other objects, no UI frame, no button, no bronze leather theme. Designed to remain recognizable at 20 to 24 pixels, prioritize the book silhouette and central fold over tiny detail.
```

模式：全部使用内置 image_gen.imagegen。以下保留实际调用的完整提示词，供制作追溯；这些是离线美术制作提示词，不进入 AI DM，不增加游戏校验。PNG 位于本机忽略的 output/ui-2026-10-08/polished-assets/，采用的 WebP 位于本目录。技术导出尺寸/切片/哈希见 [README](README.md)。原稿与中间 PNG 不提交。

## waiting-nib.webp（0.5.9）

内置 Image Gen 生成：`exec-f41759d8-41c9-473c-bc5d-143751e7321d`；源 PNG：`C:/Users/Administrator/.codex/generated_images/01a08488-3b01-7e70-8cf1-5ced29f3478e/exec-f41759d8-41c9-473c-bc5d-143751e7321d.png`。参考图只用于继承银蓝材质，原按钮与方框不修改。运行时去除外部透明空边后等比例缩至 55×128，保留原 alpha；没有程序绘画、背景抠色或额外 AI DM 提示词。

```text
Use case: stylized-concept.
Asset type: a single small painted game UI ornament, a fountain-pen nib for the AI storyteller's waiting caption in the 1920 London investigation game 雾中消逝.
Input images: the square silver-blue frame and pale-blue button are STYLE REFERENCES ONLY. Preserve those existing assets; create one NEW standalone nib ornament that belongs to their visual family.
Subject: one elegant 1920s silver fountain-pen nib, upright with its sharp tip pointing downward, seen straight-on. Recognizable tapered metal silhouette, central slit and small breather hole. Restrained engraved edge, cool pearl-silver face, slightly darker navy-steel edges, one very small warm-gold glint at the upper shoulder. A clean legible silhouette at a final 24px display size.
Style: carefully painted fantasy-investigation game UI prop, polished silver and soft blue reflection, subtle hand-painted material detail. Match the references' layered silver highlights, cool blue and pearl sheen. Keep the design uncluttered and readable. This is a painted prop ornament, not a square action icon, and has no button frame.
Composition: the nib alone centered, occupies roughly 82% of canvas height and 65% of width. Straight-on symmetric silhouette. Transparent negative space around it, no environment, no shadow plane, no glow cloud, no additional props or characters.
Text: none. No lettering, numbers, logos or symbols unrelated to the nib's actual construction.
Output: genuinely transparent RGBA background. Fine clean alpha edges; no checkerboard baked into pixels. One object only, no mockup, no alternate views, no UI screenshot.
```

## dice-panel.webp

最终生成：`exec-7f379fc7-32e8-4d1f-a11d-565c5faac498`；源 PNG：`C:/Users/Administrator/.codex/generated_images/01a11fe9-1cf1-7211-9fab-c54729782f00/exec-7f379fc7-32e8-4d1f-a11d-565c5faac498.png`。

### 初始生成

```text
Use case: ui-mockup
Asset type: ONE premium raster game UI frame/background for a vertical fate-check panel, transparent exterior. Portrait aspect ratio 639:890, target 1278x1780 or the closest supported high resolution portrait with the same aspect ratio. Show the complete asset, perfectly front-facing orthographic, no perspective, no scene, no mockup device.
Input images: Image 1 is the ONLY STYLE AUTHORITY: its cool blue rainy-mist London atmosphere, fine silver/ivory flowing lines, pale blue surfaces, restrained warm-gold accents, paired small pearl dots and four-point star tips. Image 2 is a REJECTED plain screenshot: use it ONLY to understand placement of editable content and the large empty dice region; DO NOT copy its plain flat rectangle, any words, digits, dice, background or button. This new frame must feel exquisitely crafted with real material and layered construction.
Design: a luxury late-Victorian London investigative game interface rendered as an intricate but restrained archival display frame. Muted deep navy-blue fine paper/matte enamel face, finely brushed and etched SILVER slim rim with multiple purposeful recessed fillets, small chamfered transitions, precise hand-finished corner engraving and narrow pale-blue layered inlay. Use blue-grey ink etched linear details, microscopic engraving/hatching concentrated near the frame edge, restrained blue fog depth. Tiny warm champagne-gold fastening nodes in only a few edge junctions. The face has subtle tangible fibrous blue-paper texture; the silver bevels catch quiet cool light. Exquisite production-game painted UI detailing, crisp downsampled readability. Create actual art and material detail, not an ordinary thin-line blue rectangle. Do not turn the frame into florid scrollwork or an object in a photo.
Construction: a subtly shaped vertical silhouette with small top and bottom silver lip plates and elegantly tailored rounded corners. Fine paired pearl dots and small four-point stars are integrated as fittings at the corners, matching the reference's graceful flowing linework. The frame detailing occupies only the outer 8% on either side and roughly the top/bottom 6%; never use huge corner ornaments. Its outermost silhouette ends just within the canvas and OUTSIDE it is genuine transparent alpha. All interior is opaque dark cool blue. No external environment, no cast shadow outside the silhouette.
Editable layout measured as percentages of the entire asset: the top 8%-16% high region must remain a dark, readable open LABEL area at x18%-82%; the 19%-31% high region is a wide completely empty dark NUMBER field at x20%-80%. A very fine graceful divider may sit at 33%. The central 35%-68% high region at x12%-88% is completely open for the existing real dice to be overlaid by code: no objects, no ornament in front of them. A barely visible understated old archival engraved oval guide behind this region is allowed only at extremely low contrast; no glowing rings or technology graphics.
Lower 78%-91% region: integrate a gorgeous blank horizontal RESULTS plaque/signature plate across x14%-86%. Layered softly contoured blue-paper plate, dark-blue low-contrast interior supporting large pale editable text, fine hand-engraved pale-blue/silver edge, small matched paired pearls and restrained four-point star tips near its extremities. Detailed bottom edge finishing and tiny cool bevel highlights. The plaque's inner x24%-76%, y81%-88% area is ENTIRELY BLANK and easy to read. Bottom 93%-97% contains a finely etched narrow silver lip with careful linework and quiet tiny warm-gold junctions, not another button.
Constraints: NO text, NO letters, NO Chinese characters, NO numbers, NO dice, NO people, NO icon, NO heraldic crest, NO religious symbol, NO new narrative or occult symbol, NO logo, NO watermark. No sci-fi HUD, no neon, no gears, no gothic brass/leather, no parchment tan interior, no giant ornaments intruding on editable content. Do not draw any part of the existing dice. Center is dark BLUE and low contrast, not black; real alpha transparency ONLY outside the frame. Deliver the single finished portrait panel asset only.
```

### 最终精确编辑

```text
Use case: precise-object-edit
Asset type: the provided approved portrait fate-check panel background.
Make ONLY ONE localized layout correction. Keep this exact frame, style, existing ratio and dimensions (1062x1481), blue-paper texture, silver layered border, warm-gold small fittings, paired pearl dots and star fittings. Preserve ALL four corner detailing, all outer edge geometry, exact bottom blank result plaque and bottom lip, original color palette, and real exterior transparency. No text, digits, dice, people, icons or new symbols.
Correction: the existing thin horizontal top/central separator line currently at about 28.5% of the image height (around y422) is too high. Move that entire thin separator, its existing tiny center node and its left/right endpoints DOWN to about 33% of image height (around y489). Also move the immediately corresponding top boundary of the central stage / faint engraved oval guide down with it, so the dice stage begins below the relocated separator. Shorten only the top of the central stage as necessary; keep its sides and lower boundary in place. Preserve their original finely engraved appearance and low contrast. Do not redraw or add anything to the central stage.
The editable NUMBER field at x20%-80%, y19%-31% must be COMPLETELY BLANK dark blue paper with no line or ornament crossing it. Preserve the blank LABEL region at x18%-82%, y8%-16%, the completely clear central dice region at x12%-88%, y35%-68%, and the exact original blank bottom RESULTS plaque at x14%-86%, y78%-91%. This is a precise repositioning of the upper divider and stage upper edge ONLY. All other visual details remain untouched. Keep actual transparent alpha outside; near-opaque dark blue interior. Output only the corrected portrait asset.
```

## heading-rule.webp

最终生成：`exec-bb0bdf87-c404-4157-91a7-4060992e24ec`；源 PNG：`C:/Users/Administrator/.codex/generated_images/01a11fe9-1cf1-7211-9fab-c54729782f00/exec-bb0bdf87-c404-4157-91a7-4060992e24ec.png`。

### 生成

```text
Use case: ui-mockup
Make ONE extra-wide, very short, beautifully fine SILVER-BLUE title separator ornament, isolated on genuine alpha transparency. Target canvas 1024x96, ornament total height around 40px. Complete ornament with safe endpoint margins. Use the provided home-screen reference ONLY for its fine flowing ivory/silver linework, paired dot accents and small four-point star. No screenshot, no full frame, no filled face.
This is delicate ENGRAVED SILVER INK LINEWORK, NOT a modeled solid metal beam, NOT a button. Draw TWO completely separate, parallel, mostly straight silver/icy-blue HAIRLINE STROKES across the width. Each stroke is only 2px thick relative to a 1024px width; the strokes have an 8px empty transparent gap. TRUE ALPHA 0 in every pixel of the gap, except at the tiny central node. Absolutely no blue, gray, dark or black backing between strokes. Extremely subtle silver gleam only inside the narrow strokes, no thick bevel or shadow.
At center: ONLY ONE very small warm-gold FOUR-POINT star, 14px tall relative to a 1024px width. On EACH side of that star: exactly TWO tiny adjacent identical ivory pearl CIRCLES, 3px each. No diamonds, no pointy additional shapes, no large badge. At both far endpoints: a very SHORT subtle stepped return of the fine silver strokes, with no star or leaf. Keep the whole rule balanced, slender and precise. Must remain clear at 260x24 display.
No text, numbers, icons, dice, characters, leaves, scrolls, ornate symbols, background, atmospheric haze, panel, button, medallion or plaque. All non-linework canvas and the gap between strands are actual transparent alpha. Output only the single complete horizontal ornament.
```

## panel-frame.webp

源生成：`C:/Users/Administrator/.codex/generated_images/01a1204a-cb45-78a0-8009-38192f09198e/exec-258c5252-59f6-4e7e-a85c-9d5546537436.png`；源图已做透明归一与等比缩放。

### 初始生成

```text
Use case: stylized-concept
Asset type: one production raster UI dossier / reading panel frame for a polished portrait-phone detective role-playing game, designed for nine-slice scaling.
Primary request: draw ONE finished, richly crafted square panel, 1024 x 1024 pixels, orthographic front view, centered, perfectly symmetric. This is the actual panel bitmap, not a screenshot, not a concept sheet and not a collection of components.
Input images: Image 1 is the sole style reference, the artist's official London-in-rain title screen for 雾中消逝. Match its cold navy fog, pale blue-white silver, restrained warm champagne gold, elegant curved double-line terminals, paired pearl dots and crisp four-point stars. Image 2 is ONLY the old simple panel's general shape reference. That old panel is explicitly rejected for being too plain: make the new work significantly more refined and tactile, rather than copying its single thin outline.
Composition: a complete dark blue reading plate with a slim layered edge, nearly filling the square with a small transparent exterior margin. Keep at least 80 percent of the panel visually empty and calm for readable live UI text. The interior must be opaque, continuous deep ink-blue, with exceptionally subtle misty paper grain, faint fine rain flecks and soft material depth. It should feel like an exquisitely printed and bound 1920s investigation folio rendered as a premium game UI, with cool silver finishing, not brown stationery.
Frame craft: individually drawn restrained corner pieces, delicate engraved curving tracery, double pearl-silver hairline rails, finely beveled blue-silver inner edge, a very narrow inset dark groove and sparse tiny warm-gold fastening points. Small pairs of pearl nodes and small four-point stars echo the official buttons. Let the edge visibly feel layered and hand-finished; natural minute highlights and engraved shadows, clear controlled line weight. The ornate detail is confined to each corner and the perimeter, never floating over the reading area.
Nine-slice requirements: all fixed corner decoration must fit inside the outer 96 pixels at each corner. Between the corner zones the top and bottom are continuous uniform horizontal rails and the left and right are uniform vertical rails. No centerpiece, no center emblem, no arch, no scene, no separator through the interior, and no shape that needs to retain an aspect ratio in the stretchable center. Keep the top interior calm for an editable DOM title and the bottom calm for controls.
Materials and palette: deep desaturated navy #132338 to #1a2e44 interior; muted blue-silver #8faac8 layered edging; small pale silver #d2e1ef highlights; tiny champagne #d5bc91 details. Matte fine-grained paper / cloth-like ink-blue substrate, carefully etched and burnished silver ornament, no loud glow.
Transparency: the background OUTSIDE the complete square panel must be genuinely transparent alpha. The interior panel itself must be fully opaque. Do not paint a checkerboard, white or black backdrop.
Constraints: no words, letters, digits, UI icons, title, people, portrait, dice, photographs, buildings, occult/religious symbols, science-fiction HUD, wood, brown leather or bronze. No visual noise, no heavy thick baroque frame, no strong vignette. Only the single finely finished frame and its quiet continuous reading surface.
```

### 最终精确编辑

```text
Use case: precise-object-edit
Asset type: nine-slice scalable game UI dossier frame.
Edit target: Image 1, the newly generated refined silver-blue square panel with genuine exterior transparency.
Change ONLY the four mid-edge decorations: remove the star and all pearl/gold beads at the middle of the top edge, middle of the bottom edge, middle of the left edge, and middle of the right edge. Seamlessly restore the underlying long straight layered rails at each removed location. The middle 70 percent of EACH of the four edges must be a smooth continuous uniform straight rail, no knots, stars, dots or accents anywhere in these stretchable middle segments.
Preserve EVERYTHING else: all four decorated corners, their size and geometry, paired corner pearl nodes, tiny warm champagne gold corner details, the blue-silver double line bevels, the dark matte navy subtle texture of the fully opaque reading center, the full square outline, and the genuinely transparent outside alpha. No change of color, lighting, crop, or proportions. Do not add any new ornament or any text. This is one production bitmap frame, not a UI screenshot or asset sheet.
```

## portrait-mount.webp

最终生成：`exec-06b412f6-f2d4-4fea-bb03-ed9ecb7d701a`；引用原首页及已有装裱图，保留人物窗口全透明。

### 最终精确编辑

```text
Use case: precise-object-edit.
Image 1 is the only style reference, the cold-blue London-fog homepage. Image 2 is the accepted silver-blue portrait frame.
Create an edited version of Image 2: keep the same silver bevels, gray-blue paper lining, leaflike linked silver corner lines, pearl pairs and tiny warm-gold four-point nodes. Keep one complete front-facing4:5 portrait frame.
Make the entire frame border HALF AS THICK toward the inside, expanding the transparent portrait window greatly. Shrink all four corner ornaments and both top/bottom crest ornaments to HALF their current size, placing them nearer the outer edge so they cannot protrude into the central portrait window. The delicate painted details should remain, just fit into slimmer border bands. Keep the exterior silhouette approximately the same, no extra transparent canvas margin.
The actual transparent hole should occupy almost the whole canvas: at least88% of full canvas width and90% of full canvas height. It is a normal straight-sided rectangular window, with only tiny6px inner corner rounding, NO stair-step cutout, NO notch, NO inward-pointing silver tip. The top and bottom inner border lines are completely straight. Outer crest peaks may point away from the window only.
The centered76%-wide82%-high rectangle must be pure alpha0 in every pixel, including its four corners and the middle of its upper and lower edges. Real hollow cutout ring, transparent window and exterior, no scene, paper panel, portrait, colored fill or checkerboard across the empty hole.
Keep restrained cold silver, slate rain-blue and tiny warm-gold accents. No person, face, eye, text, numbers, logo, brass, leather, steampunk, HUD, glow, collage or extra frames. ONE hollow frame only.
```

## input-frame.webp

最终生成：`exec-ecdd5b64-a24a-4528-ba56-fb0660c697a2`，2026-10-09T10:56:05.514Z；新图无目标图编辑。

### 生成

```text
Use case: ui-mockup. Asset type: ONE production-ready blank illustrated input-field plate for the portrait mobile mystery RPG 雾中消逝 (1920 London investigation). Primary request: a meticulously finished, drawable two-to-one rectangular input socket, 1024x512 or matching aspect, straight-on orthographic UI artwork only. Shared accepted game art language: subdued rain navy blue, pale cool silver / ivory engraved fine rails, minuscule warm champagne-gold corner nodes, paired pearl dots and discreet four-pointed star geometry. Draw actual multi-layer edges, delicate hand-finished inlay, softly textured dark blue stationery with low-contrast natural grain and very subtle mist; sophisticated period investigation game craftsmanship. Fine rectangular silver edge with gently chamfered curved shoulders and tiny corner detail, no bulky ornaments. Center must be a continuous, near-opaque very dark navy writing area #101c2d, entirely empty and comfortably readable. It will be nine-sliced for a 44-96px-high multiline action input, small form fields and skill/case search; keep ALL ornate detail within a narrow consistent approximately 64px corner zone, and top/bottom/left/right middle edge segments uniform with no midpoint symbol so stretching is safe. Outside of the complete plate genuinely transparent alpha, very tight outer padding. One asset only, no composited app screen. No words, lettering, numerals, characters, dice, scenery, logo, watermarks, grids, simulated transparency checkerboard, sci-fi HUD, leather or copper/brass. The quiet central writing region is about 85% of width and 70% of height, the cold silver/blue fine layered craft should look substantially richer than a normal web form outline.
```

## control-stud.webp

最终生成：`exec-67cabce3-a857-41e3-981f-39606fdc64fa`，2026-10-09T11:02:18.996Z；新图无目标图编辑。

### 生成

```text
Use case: ui-mockup. Asset type: ONE production-ready small circular slider/switch stud for a portrait mobile 1920 London mystery RPG. One standalone circular knob 512x512, front-on flat orthographic UI render, centered with tight transparent outer margin. Accepted game visual language: cold rain-blue stationery, finely layered pale silver/ivory engraving and very restrained champagne-gold details; a pearl-like luminous ivory center with soft cool blue tint, delicate silver rim, dark blue narrow inset circumference, one subtle tiny four-point engraving or gleam only. The image will be displayed as a 24px sound volume slider knob and 18px on/off switch thumb, so polish the actual shape/material and keep silhouette clear and center simple. Elegant hand-finished period investigation game hardware, quiet believable paper/silver texture, soft relief without a hard cast shadow. True alpha transparency outside the entire circle, central stud opaque, no checkerboard. Draw one asset only, no app screen, no button sheet, no lettering, digits, logos, icons, characters, scenery, sci-fi neon, leather or copper/brass. Match warm pearls and cold silver-blue engraved frame language, not a generic modern web toggle.
```

## icon-frame.webp

源生成：`C:/Users/Administrator/.codex/generated_images/01a1204a-cb45-78a0-8009-38192f09198e/exec-d28ac21e-6fc1-433b-9c89-1318246684c8.png`；参考首页、采用的阅读框与旧浅蓝按钮形状。

### 初始生成

```text
Use case: stylized-concept
Asset type: ONE production raster square game UI tool-button backing plate, 512 x 512 pixels, made to be displayed at 44 x 44 pixels.
Primary request: paint a finely finished elegant silver-blue square button plate for the 1920s London-in-rain detective game 雾中消逝. A separate dark-ink outline icon will be overlaid later by the interface; generate the backing plate ONLY, not any icon.
Input images: Image 1 is the artist's official title-screen style reference: cold mist-blue London, pale blue-silver and small warm champagne accents, curved double outlines, paired pearl dots, restrained four-point stars. Image 2 is the accepted new dossier frame; use precisely the same illustrated layered silver-blue metal edge craftsmanship and grain. Image 3 is the old plain light-blue square button shape only. Improve its craft and depth substantially while keeping the light readable center.
Composition: one complete square with subtly softened corners, orthographic front view, centered and aligned with the canvas; tight framing with a tiny genuine transparent outside margin, complete uncut outline. A thin layered pearl-silver beveled surround, a hairline blue-gray inset groove, and a very faint hand-engraved corner finishing detail. At each corner a tiny champagne-gold fastening point, with very small paired pearl nodes or discreet four-point star finishing marks to echo the artist's buttons. All decoration remains close to the outer perimeter. Refined controlled layers, not a thick elaborate baroque border.
Center: at least 70 percent of the button must remain clear unobstructed space for a dark ink icon. Opaque matte light gray-blue coated paper surface, extremely fine low-contrast paper grain, a barely noticeable pale blue to muted gray-blue top-to-bottom tonal change. The center is visibly light, from about #c4d3e3 to #9dafc9, never dark navy, never white. A very shallow inset creates quiet tactile depth at the edge; do not create a glossy glass lens.
Material and mood: handcrafted premium illustrated detective-game UI, finely burnished cool silver edge with narrow highlights, subtle printed blue paper, delicate little warm-gold details. Match the accepted dossier frame's design language with lower ornament density because this button will be tiny on a phone.
Transparency: actual transparent alpha outside the square button. The full button surface inside must be opaque. No checkerboard, scene, dark/white presentation background or drop-shadow canvas.
Constraints: no text, letters, numbers, glyphs, pictogram, menu lines, cross, eye, book, portrait, dice or any center symbol. No modern frosted-glass app design, neon, science-fiction HUD, brown leather, bronze, wood or intense glow. No montage, no sheet of assets, no screenshot. Only one finished square backing plate with enough calm center space for the later icon.
```

### 最终透明外边清理

```text
Use case: background-extraction
Asset type: a production transparent game tool-button backing plate.
Edit target: the single supplied newly generated square silver-blue backing plate.
Change only the OUTSIDE TRANSPARENCY cleanup: remove every stray blue, cyan or white fleck, streak, splatter and isolated pixel outside the actual silver square button's complete outline, especially the floating white flecks ABOVE its top edge and the electric-blue splashes BELOW its bottom edge. All exterior pixels beyond the clean square button silhouette must be genuinely transparent alpha, with only a very narrow natural antialiased edge around the button. No colored haze or ragged residue outside the outline.
Keep the actual square button COMPLETELY unchanged: same shape, complete uncut four corners, same light gray-blue matte textured icon center, same fine layered silver bevel rails, same tiny gold corner points, same paired pearls and four-point corner stars, same size and colors. The entire center surface inside the button stays fully opaque. Do not repaint, smooth, blur or remove the drawn frame. Do not add anything. No text, icon, digits, symbols in the center or backdrop.
```

## archive-theory.webp

唯一生成：`exec-24af29f1-76d2-4872-9ffc-72daacaaa717`，2026-10-10。使用内置 Image Gen 新图生成，无参考图、无后续编辑；原 PNG 保留本机生成目录，不提交。仅等比例缩放和 WebP 编码，采用图与哈希见 README.md。

```text
Create one finely hand-painted incandescent light-bulb emblem for a production game UI, used as the existing generic symbol for a hypothesis in a 1920s London mystery tabletop RPG. One complete classic rounded pear-shaped bulb with a short threaded brushed-silver base, opaque pale cool ivory-blue glass shading for clear small-size readability, one very subtle muted-gold filament mark within the glass. The base has layered fine silver bands, a tiny discreet four-point silver star engraved in one fitting, and two minute pearl rivet dots. Match cold midnight-blue archive panels, rainy navy cloth, controlled ivory-silver highlights and restrained gold details. Almost front-facing, compact vertical silhouette, broad recognizable shapes rather than delicate wire lines, rich but restrained hand-painted material details. This bulb must read as a light-bulb symbol at 16 pixels high and as an elegant painted UI object at 48 pixels high. Center the complete object with generous real transparent margin; tall aspect around 2:3. This is a generic idea/hypothesis emblem, not an illuminated prop from the story. A polished two-dimensional raster game asset, no thin web vector outline, no photograph or complete screen. One bulb only. No lettering, numbers, labels, rays, glow, shadow outside the object, people, scenery, panel, leather, sepia paper or ornate filigree. True native RGBA alpha 0 outside the clean complete silhouette, only narrow antialiased edge alpha; no colored background haze or drawn checkerboard. Keep the bulb and base visually solid enough to sit clearly on a dark blue panel.
```

## archive-file.webp

初始生成：`exec-318ed20b-40a8-43a5-a68d-d713b737dd83`；最终外部透明度编辑：`exec-e4fea1b8-4439-475d-bc61-2e131966e73c`，2026-10-10。均使用内置 Image Gen；初始新图无参考图，编辑只参考初始生成 PNG，原生成文件保留本机生成目录，不提交。

### 初始生成

```text
Create one finely hand-painted compact document emblem for a production UI in a 1920s London mystery tabletop RPG. A single closed investigator's document folder, viewed almost straight-on with a very slight three-quarter angle: deep rainy navy-blue cloth front cover, two pale cool ivory-blue paper leaves neatly peeking from the top, a small folded page corner, slender brushed-silver layered corner fittings, one tiny restrained muted-gold fastener. Include one discreet four-point silver star at a lower corner and two small paired pearl dots as metal detailing. Match a cold midnight-blue, foggy London game UI with finely painted blue paper, silver rails and ivory highlights. The silhouette should read immediately as a document at 16 pixels high, and as a tactile painted object at 48 pixels high. Broad clear shapes, controlled edge highlights, elegant material detail. Tall compact aspect about 2:3, whole object centered with generous actual transparent margin. The paper and folder are blank. This is a generic archive emblem shared by evidence and event records, not a depiction of a story clue. Produce a polished two-dimensional raster game asset, not a thin web outline icon or a full interface. One object only. No text, numbers, letters, seal writing, people, props, scenery, UI panel or ground shadow. No brown leather, sepia parchment, ornate gold filigree, glow or diffuse background haze. True native RGBA transparency outside the clean complete silhouette, narrow natural antialiased edges, no checkerboard drawn into pixels. Preserve opaque painted material inside the folder.
```

### 外部透明度编辑

```text
Edit only the outside transparency of this supplied painted silver-blue archive folder emblem. Keep the entire folder, blank paper leaves, folded corner, blue fabric texture, silver corner fittings, paired pearl rivets, four-point star and small gold fastener exactly as drawn: unchanged colour, shape, size, perspective, composition and complete silhouette. Remove all white, gray and blue diffuse background haze and glow above, beside and below the object, all large soft shadows, and every non-object pixel outside the exact folder and paper outline. The whole outside region must be true RGBA alpha 0, with only a very narrow natural antialiased silhouette edge. The physical folder, paper, fittings and fabric should remain opaque. Do not darken, smooth, repaint or simplify the object. Do not introduce a background or drawn checkerboard. No text, labels, new symbols or new objects. Return a clean production cutout for a small game UI document emblem on a midnight-blue panel.
```

## archive-empty.webp

初始生成：`exec-b6b772b3-d3ff-4700-9d08-911f4354b1df`；最终透明边缘编辑：`exec-3daf8d04-3d6d-4987-b98d-ace4fca67cb5`，2026-10-09。均使用内置 Image Gen，初始新图无参考图，编辑仅参考初始生成 PNG；原生成文件保留于本机生成目录，不提交。

### 初始生成

```text
Create one finely painted game UI inventory illustration for the empty-record state of a 1920s London mystery tabletop RPG. A small open investigator's case ledger with two entirely blank, pale blue-grey paper leaves, a deep rain-blue cloth cover, layered brushed-silver corner fittings and one restrained muted-gold pin. A slender silver magnifying glass rests diagonally across the lower right edge. Composition is a compact, clearly recognizable object, slightly elevated three-quarter view, centered with generous actual transparent space around it. Match an existing cold midnight-blue UI with ivory-silver fine double outlines, tiny paired pearl details and discreet four-point star motifs at metal corners. Rich hand-painted material detail, subtle worn blue fabric, softly shaded cool paper and controlled silver edge highlights; crisp silhouette and legibility when displayed at 64 to 72 pixels high. The ledger pages are empty. The visual mood is quiet investigation, no warning or failure cues. Produce a polished two-dimensional game asset, not a web outline icon, photograph or complete interface. No people, scene background, lettering, numbers, logo, progress indicator or outer UI panel. No brown leather or warm sepia parchment. Use native RGBA transparency outside the object, preserve soft edge alpha, avoid a checkerboard drawn into the pixels and avoid a large ground shadow. One object composition only, no variants or contact sheet.
```

### 外部透明区域清理

```text
Edit only the transparency and outside-edge cleanup of the supplied open silver-blue investigator ledger asset. Keep the book, blank paper leaves, blue cloth, four silver corners, pearls and stars, small gold pin and magnifying glass exactly as drawn: same shapes, materials, colours, texture, perspective and composition. Remove all diffuse blue, grey and white background haze, all large soft ground or glow shadows around the object, and all non-object background pixels. The whole outside region around the exact ledger and magnifier silhouette must be true RGBA alpha 0, with only a narrow natural anti-aliased silhouette edge. The physical book, pages, metal and handle must be opaque; only actual glass highlights may retain a little natural translucency. Do not darken or repaint the object. Do not introduce a presentation background or checkerboard. One existing object only, no text or new details. Return a clean production cutout ready to show at a small size on a midnight-blue game panel.
```


## 归档徽记（0.5.23）

内置 Image Gen 单次新图，无参考图与后续编辑；生成 ID `exec-82629e49-c7bb-43a3-9816-8a2c3f5eed4b`，源图保存在默认 generated_images 目录，运行时仅采用 README 所列压缩图。调用 transparent_background=true。以下是实际使用的完整提示词：

```text
Use case: stylized-concept. Asset type: one premium transparent painted game UI archival seal for the completed-investigation summary in a 1920s London mystery tabletop game. Primary request: a small handsome neutral CASE ARCHIVE SEAL, centered and fully contained. A circular navy-blue wax medallion with a clearly legible brushed-silver outer rim, restrained silver engraving and a simple raised four-point star at its center, matching a cold midnight-blue paper-and-cloth interface with silver corner ornaments and paired pearl rivets. Two short cool ivory-blue ribbon tails descend from its bottom edge; no printed words. One very thin muted-gold accent ring, subtle painterly material and controlled silver highlights. Wide bold silhouette and clean dark-blue contour, bright silver rim reads clearly on dark navy panels, details stay secondary at 28 to 32 pixels. Slightly elevated frontal view, low relief, two-dimensional painted inventory illustration, no photoreal dramatic lighting. Symbol means a record has been filed, neutral for every story outcome, not a victory trophy, military medal, police badge, crown or reward. Square canvas, generous true transparent outside margin with all ribbon ends complete. Actual native RGBA transparency outside the object; no surrounding glow, fog, drop-shadow rectangle, ground or checkerboard painted into pixels. No letters, numbers, labels, complete UI, panel, button, extra objects or plot facts. Match refined cold silver-blue mystery game art, no bronze leather theme.
```
