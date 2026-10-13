# DrawingPad

A Spindle extension for sketching, handwritten notes, and sharing a little drawing with a conversation. Requires Lumiverse **1.2.5 or later**. The extension uses the existing host APIs and ships its own browser drawing surface.

## What you can do

- Draw with ink, pencil, marker, or an eraser. **Blend** (keyboard shortcut **S**) carries and mixes existing colors on the active layer with a soft edge. Adjust **Size** and **Strength**; Pencil pressure controls the amount of blending when Pressure is enabled. Blend remembers its own size/strength separately from painting, adds no selected color, and works with undo/redo, editable files, thumbnails, and PNG export.
- Adjust color, size, opacity, and stabilization. **Color** opens a full-spectrum hue/saturation/brightness picker with hex input; the swatches are quick shortcuts.
- The color picker keeps the last **18 distinct colors used in completed drawing strokes**, newest first. Reusing a color moves it to the front; blending, erasing, and canceled strokes do not add colors. **Save color** pins the current color to your saved palette. Tap a swatch to reuse it, or choose **Edit** to remove a saved color. Both lists persist to your Lumiverse account and carry across sketchbook pages.
- Choose an aspect-correct paper card before creating a canvas: Landscape, Portrait, Square, A4, Letter, or 4K Widescreen. Edit width and height for a custom size. There is no fixed limit per side; the dialog shows the PNG working-memory estimate and checks that the browser can allocate your chosen size. PNG export preserves the requested pixel dimensions.
- Use Apple Pencil pressure and tilt. The pencil brush broadens with tilt; the ink brush varies with pressure. Open **Pencil details** to inspect the actual input your device provides.
- **Steady** now applies a speed-adaptive pen filter: stronger smoothing during slow movements, less lag during quick strokes, and smoother pressure/tilt changes. Its feel stays consistent across zoom and UI scale. Set Steady to 0% for unfiltered pen samples. Lifting preserves the last contact position without adding a zero-pressure release tail. Existing saved strokes retain their original geometry.
- Use the shared **Pressure** and **Pen only** checkboxes. Pen only lets fingers move the page without making marks. Mouse drawing still works. During a Pencil stroke, finger contacts cannot move the page.
- Use two fingers to pan, pinch to zoom, and rotate together. Rotation softly snaps to **0°, 90°, 180°, and 270°**: it locks within 3° and gently attracts within 9°, with free rotation beyond that. The angle readout resets rotation while keeping zoom and the viewport center. Pencil hover shows the brush position when the device/browser supplies hover events.
- Open a full-screen workspace. **Fullscreen canvas** hides the surrounding controls while keeping drawing tools and a visible **Close** button; **Restore controls** brings them back. **Fit page** resets pan/zoom and returns the canvas upright. Escape returns from canvas fullscreen or the sketchbook, then closes the workspace.
- Work with up to six independent layers, layer visibility and opacity, reordering, and undo/redo. Erasing and blending affect only the active layer. Blend can smear paint into transparent areas; it does not sample paper or other layers.
- Choose white, cream, ruled, grid, or transparent paper. Paper guides are included in the exported image.
- Keep pages in your account's sketchbook without an application-imposed drawing count limit. The scrollable gallery loads page metadata and nearby thumbnails as needed; arrow keys, Home/End, and Page Up/Down also browse the collection.
- Drafts save automatically **700 ms after the last edit**, including title changes. Pending strokes, layer/paper changes, and renames share the same timer. Saving waits for an active stroke to finish, and closing, switching pages, opening the sketchbook, or hiding the page flushes pending changes immediately. Save an editable `.drawingpad.json` file to continue a sketch later, or open one as a new page.
- **Save PNG** produces the full page resolution. On iOS/iPadOS, it opens the system share sheet when file sharing is available; choose Save Image or Save to Files. Other browsers download the PNG.
- **Share to chat** sends a user message with a native PNG attachment and an optional caption. The host can display it and include it in vision context. It does not start an assistant reply automatically.

## Install locally

The source, dependencies, and prebuilt `dist/` bundles are in `~/Projects/Lumiverse-DrawingPad`.

1. Make a real `drawingpad` directory under your Lumiverse data directory's `extensions/` directory. Inside it, link this project as `repo`:

   ```sh
   mkdir -p /path/to/lumiverse-data/extensions/drawingpad
   ln -s ~/Projects/Lumiverse-DrawingPad /path/to/lumiverse-data/extensions/drawingpad/repo
   ```

   For this checkout's default data directory, use `/Users/darranhall/Projects/Lumiverse-Backend/data/extensions/drawingpad`. Use an empty extension directory; preserve any existing installation or storage.

2. In Lumiverse's **Extensions** panel, choose **Import local**, then enable **DrawingPad**.
3. Allow **Images** and **Chat mutation** to share drawings. Drawing, draft saving, and device export work without those permissions.
4. Open **Draw** in the drawer, search for DrawingPad in the command palette, or choose **Draw or jot a note** in the chat input's Extras menu.

`dev_mode: true` makes the existing extension **Update** action rebuild the local source without resetting it to a remote Git branch. Set it to `false` when publishing a normal release. The manifest's GitHub URL names the intended repository; local import is the installation route for this prototype.

## Develop and preview

```sh
cd ~/Projects/Lumiverse-DrawingPad
bun install
bun run typecheck
bun run test
bun run build
bun run demo
```

Open `http://127.0.0.1:4816`. The standalone preview uses simulated Spindle storage, placement, permissions, and image APIs. Its chat stays inside the preview; it never sends a message to your real Lumiverse account.

Run browser checks with `bun run test:browser`. If the browser binaries are missing, run `bunx playwright install chromium webkit` first. The script prefers installed matching browsers and can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a custom Chromium location. Screenshots and an exported PNG are written to `test-results/`.

For the pen smoothing and Blend checks alone, run `bun run test:brushes`.

For Pencil testing on an iPad, use the actual installed extension in your HTTPS Lumiverse PWA. A desktop WebKit check does not reproduce Apple Pencil hardware, palm recognition, or the iPad's compositor latency.

## Spindle integration

The implementation follows the checkout's developer docs for [extension entry points](../Lumiverse-Backend/developer-docs/docs/getting-started/quick-start.md), [UI placement and shared components](../Lumiverse-Backend/developer-docs/docs/frontend-api/ui-placement.md), [frontend/backend messages](../Lumiverse-Backend/developer-docs/docs/backend-api/frontend-communication.md), [per-user storage](../Lumiverse-Backend/developer-docs/docs/backend-api/storage.md), [resumable uploads](../Lumiverse-Backend/developer-docs/docs/backend-api/uploads.md), and [image assets](../Lumiverse-Backend/developer-docs/docs/backend-api/images.md).

`src/frontend.ts` registers a drawer tab and an input-bar action. A host-managed modal provides the workspace lifecycle; the extension's own root fills the viewport, using Spindle's documented scaled viewport variables. It supplies its own close control because persistent host modals omit theirs. Canvas fullscreen uses layout changes, so it also works in the iOS PWA without the browser Fullscreen API or additional permissions. Text inputs, labeled checkboxes, and the canvas dialog's numeric inputs use `ctx.components`; drawing controls and Canvas 2D render directly into the extension's owned DOM. Button styling targets extension controls without overriding shared components. Pointer coordinates are converted from rendered to layout pixels to respect the host's UI scale.

`src/backend-handler.ts` keeps documents and their index in `spindle.userStorage`, with user-scoped write queues. Backend replies carry the originating user and, when supported, the originating document id. PNGs travel through the documented tus endpoint, then `spindle.uploads` and `spindle.images`; they are never packed into a large WebSocket message.

The sketchbook index contains compact metadata, with catalog responses capped at 64 entries per request. New previews live separately in `thumbnails/` and load only for viewport rows plus one row of overscan on each side. Both the drawer and workspace use the same virtualized grid, four concurrent preview requests, an eight-page metadata cache, and a 64-preview cache. Mounted cards retain their previews until recycled. Catalog revisions detect collection changes between page requests, and each save gets a fresh preview version to prevent stale images. Failed previews can be retried without blocking the page from opening. Existing inline previews remain readable; saving or deleting a page upgrades the index without rewriting other drawings.

There is no replacement drawing-count cap. Available server storage still determines how much can be saved. The backend reads/sorts the compact metadata index for pagination, so its indexing work grows with collection size; browser card counts, thumbnail traffic, and caches stay bounded by the viewport and configured batches.

Account colors live separately in `colors/palette.json`. Color saves use the same 700 ms debounce and flush with pending drafts. The frontend sends mutations that the backend merges under the account's write queue, preserving other tabs' saved swatches. Palette changes made before loading finishes and failed writes remain queued for retry. The saved palette accepts up to 256 distinct colors.

Drawing previews update immediately. Thumbnail generation, draft writes, and PNG rebuilding wait for the debounce; title-only edits reuse the existing PNG. Overlapping flushes of the same document snapshot share the in-flight save instead of writing it twice.

Rotation is a view transform. Drawing input uses its inverse so Pencil/finger/mouse marks stay aligned at any angle; editable documents, thumbnails, and PNG exports retain their original canvas orientation and pixel dimensions. Gesture midpoint anchoring combines pan, zoom, and rotation. Tracking the unsnapped finger angle avoids repeated attraction when a gesture resumes, and continuous angular deltas cross the ±180° boundary without a jump. Extra fingers do not replace an active pair, and palm contacts cannot rotate the canvas during a Pencil stroke.

Spindle's `chat.appendMessage()` accepts text and Spindle metadata, but cannot create `extra.attachments`. `src/sharing.ts` therefore uses the host's existing authenticated `POST /api/v1/chats/:chatId/messages` endpoint for the final native image attachment. This is the same endpoint as the host composer, verified against the current checkout. DrawingPad checks its declared sharing permissions and the active chat again before posting. The endpoint performs the host's normal account/chat ownership checks. This core REST dependency should be rechecked if a future Lumiverse version changes its message contract.

Sharing disables duplicate clicks and does not automatically retry message creation. A failed or interrupted response may follow server acceptance; the UI asks you to check the chat before retrying. Images are retained for ambiguous failures so an already-created attachment remains usable.

## Input and data limits

- Pointer Events run in the browser. Coalesced samples improve fidelity; predicted positions are temporary preview points, replaced by confirmed input and excluded from drafts and PNGs. Unsupported APIs fall back to ordinary pointer moves.
- The pen filter follows the [speed-adaptive 1€ filter](https://gery.casiez.net/1euro/), using hardware sample timestamps and velocity in displayed pixels. Each prediction runs through a copy of the filter so it cannot change confirmed points. Already-filtered pen strokes bypass the geometry library's additional centerline stabilization. Blend uses confirmed points only and incrementally updates a small color reservoir during live drawing; PNG export replays blend operations at the requested resolution.
- Safari 18.2+ provides coalesced/predicted events and additional angle APIs. Use HTTPS for the coalesced API. [WebKit release details](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
- Apple Pencil USB-C has no pressure sensor. A constant pressure reading on that model is expected. [Apple's comparison](https://www.apple.com/apple-pencil/)
- Pencil Pro squeeze, double-tap, barrel roll, and haptics are outside this demo.
- Canvas creation uses an explicit **128 MiB working-memory budget** for the two full-resolution RGBA buffers used to compose a PNG. That allows **16,777,216 total pixels** in any aspect ratio, subject to the browser's allocation check. This is an extension policy budget, not a measurement of available device memory. A4 (2480 × 3508), Letter (2550 × 3300), and 4K (3840 × 2160) fit. Paper names describe the aspect and pixel size; exported PNGs do not specify a print DPI.
- Drawing previews use buffers with a longest side of 2048 pixels, keeping layer memory bounded. PNG export replays strokes at the full requested resolution, one layer at a time, including blending, erasing, visibility, and opacity. High zoom can reveal preview pixels; the exported image retains full resolution. [Canvas allocation limits vary by browser/device](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas); [RGBA pixels use four 8-bit channels](https://developer.mozilla.org/en-US/docs/Web/API/ImageData/data).
- Each document is limited to 60,000 confirmed points, 12,000 points per stroke, and 3 MB of editable data; a shareable PNG must be under 16 MB. Undo keeps the last 40 document changes.
- Autosave needs a connection to Lumiverse. If saving fails, the current drawing remains usable and can be exported. Closing and reopening the pad in the same loaded page offers the unsaved drawing again; export before reloading an offline page. A PNG flattens the layers; keep an editable file when you want to continue drawing.

## Validation

Unit tests cover palette history ordering and limits, pinned swatches, account isolation, concurrent palette merges, loading/save-failure recovery, duplicate draft flushes, the canvas memory budget, bounded preview dimensions, wide-page stroke coordinates, document validation, color conversion and hex validation, history, camera coordinates, pressure/tilt geometry, coalesced-event fallback, concurrent saves, upload ownership, permission denial, and the native attachment request shape.

Gallery checks exercise 1,001 saved pages in Chromium and WebKit, including legacy index migration, lazy preview reads without loading editable files, viewport-bounded card counts, pagination, keyboard navigation to unloaded pages, distant open/delete, saves beyond the former cap, preview failure/retry, mobile layout, and 150% host UI scale. Unit checks also cover revision changes, stable pagination with timestamp ties, account isolation for previews, and cache/window bounds up to 100,000 entries.

The standalone browser harness checks aspect-correct paper presets, mobile and scaled setup layouts, allocation-failure recovery, the memory budget, bounded previews, A4 and 8000 × 1000 PNG dimensions, and full-resolution stroke/layer pixels. It also exercises custom resolution in drafts, touch color selection and arbitrary hex colors, shared checkboxes, full-screen workspace sizing, canvas fullscreen and restoration, close and Escape behavior, nested dialogs, focus restoration, 150% host UI scale, pen input, exclusion of predictions from saved data, finger rejection in Pen only mode, layers, undo/redo, reload persistence, chat attachments, permission denial, desktop/mobile layouts, and WebKit drawing/A4 export. Physical iPad/Pencil behavior still needs a device pass.

Controlled-clock browser checks verify that rapid title/stroke edits produce one save after 700 ms, renaming avoids PNG rebuilding, stroke bursts produce one PNG, and closing flushes a pending title without a stale timer firing later. Color checks cover 18-entry history, swatch selection, pinning, removal, and persistence across reloads in Chromium and WebKit.

Rotation checks in Chromium (desktop, touch/mobile, and 150% UI scale) and WebKit cover all quarter-turn snaps, pulling out of a snap, angle wraparound, simultaneous pan/pinch, off-center anchors, gesture continuation/cancellation, extra fingers, rotated Pencil coordinates and predicted samples, palm rejection, orientation-preserving PNG export, and reset controls. Unit tests verify forward/inverse coordinates, rotated zoom anchors, snap continuity, and angular deltas.

Brush checks in Chromium and WebKit verify color and alpha mixing, active-layer isolation, empty/translucent layers, pressure/strength, incremental previews, cancellation, undo/redo, reload, full-resolution blend PNGs, tool settings, and exclusion from color history. Timed coalesced pen samples verify jitter reduction, prediction isolation, and contact endpoints; unit tests also compare sample rates, rotation, zoom, smoothing strength, pressure/tilt, and distance-based blend spacing.

The frontend bundles [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for stroke geometry and [tus-js-client](https://github.com/tus/tus-js-client) for uploads. Their license notices are included in `THIRD_PARTY_NOTICES.txt`.
