# Procedural Art Studio — implementation ledger

## Extension-point audit

The existing pipeline is identity → descriptor → family geometry/growth → raster → cached plant/icon/piece frames. `visual/descriptor.js` owns independent morphology, palette and surface seeds. `Model` and `rasterize` are pure and run in Node and browsers. `species-sprites.js` caches plants, icons and placement silhouettes; `pieces.js` maintains the atlas and physical masks. Changing silhouettes can change gameplay, not merely decoration. `env/scene.js` owns terrain masks and attachment metadata: terrain authoring must update them together. Rabbit rendering uses anatomical anchors and poses; fluid and potion effects have separate simulation inputs. These need dedicated adapters, not generic sprite replacement.

`App._swap` is the screen lifecycle boundary. Game/sandbox persistence use separate localStorage records. Studio uses a separate IndexedDB database. The custom bundler accepts static named/namespace imports and acyclic dependencies; new modules follow that contract. Studio CSS is included in the existing main stylesheet to ship offline.

## Delivery boundary

This branch delivers a coherent first implementation of phases A–C and a runtime palette bridge. It is **not the complete A–G Studio**. See the capability and remaining-work sections below. Unsupported workspaces are not presented as working editors.

## Using this delivery

1. Open **Procedural Art Studio** on the main menu. The library starts with an editable stem-and-leaf construction. **New plant** creates an independent asset. Category, folder and tags are editable; search matches all four. **Projects** creates, renames, duplicates, loads and deletes project drafts.
2. Select a component on the left. Edit its source geometry in Properties, or use **Draw component** for a blank 32×32 canvas. Pencil, eraser, line, rectangle, ellipse, fill, eyedropper, rectangle/lasso/contiguous selections and correction-pixel move operate in image coordinates. Wheel zoom is pointer-centred; Space-drag or Pan moves the view. Fit, grid and anchor guides aid close work. Touch supports the same single-pointer tools and pan; use Fit on small screens.
3. Use Base/Tip tools to position attachment anchors. Select pixels, **Extract selection as component**, choose a parent rule, then **Attach selected component**. The result participates in procedural construction: its descendants inherit its scale, rotation and anchor frame. On desktop you can also drag a component from the library onto the generated preview to create a root attachment. Dragging an instance moves its attachment rule; selecting it opens that component's artwork.
4. The Rules tab is the executable hierarchy, not a decorative node diagram. Select a rule to change parent, component, offsets, rotation, scale, repetitions, distribution spacing, angle variation, probability, mirrored alternation, weighted-choice group, overlap exclusion and stage range. Choice groups choose one alternative per parent instance. A lock fixes **local** morphology randomness and local growth scale at a stored seed; it does not freeze a node in world space if its parent moves.
5. Growth edits the shared structure at **Sprout → Ripe → Mature** with stage scales and node appearance ranges. Play cycles those stages (it is not a full animation timeline). Variants generates six seeds, lets you choose one, and stores the selected seed. Capture comparison and Before/after show the saved image on the left and current construction on the right.
6. Pixel corrections are separate from geometry and procedural shading. Layers have order, visibility and opacity. Scope applies to **all variants of this component**, the current exact seed, or the current stage. Reusing the component reuses its corrections; a correction is never inferred to mean a general anatomical rule. Transform operations affect correction pixels around the 32×32 canvas centre; pixels outside that canvas are clipped. Erasing is an explicit transparent cutout, distinct from an untouched pixel. Copy samples the composited component; Paste writes into the current layer. PNG import fits into 32×32 with nearest-neighbour sampling and adds a layer. Export PNG exports the composited component with transparency.
7. **Save Draft** stores all editable data in IndexedDB. Exiting or Previewing saves first and stays in the Studio on storage failure, so the error can be read and an export made. Export Project downloads portable versioned JSON. Import creates a separate draft and rejects unsupported versions or malformed data before replacing anything. Exports remain the backup mechanism when browser storage is cleared.
8. Expand **Game art direction — ingredient ramps** in Properties. Global, biome, family and species scopes have explicit precedence in that order; overrides are complete style records. Select Tint, Tint strength, Saturation and Contrast, or a preset. **Preview linked ingredient** uses the actual plant/icon/fragment generators at each growth stage. **Preview in Game** temporarily uses the draft in a fresh unlimited experiment; **Return to Art Studio** restores the previously active direction. Neither the shop save nor the sandbox save is written during this preview. **Apply Art Profile** persists the direction for future sessions. **Revert** restores the original generators while retaining the editable draft.

Shortcuts: B pencil, E eraser, M rectangle selection, I eyedropper, G fill, Escape deselect, Delete explicit cutout; Ctrl/Cmd C/V copy/paste, Z undo, Shift Z redo, S save. Native text fields keep their normal shortcuts. Panels scroll, resize and collapse, and remember their size/collapse preferences separately from gameplay settings. The interface keeps mouse controls on tablets/phones; physical-device testing is still needed.

## Modules and portable format

| Module | Responsibility |
| --- | --- |
| `src/studio/model.js` | Version 1 schema, factories, import migration and bounded snapshot history |
| `src/studio/pixels.js` | Flood regions, polygon selection, nearest-neighbour transforms, alpha composition and cutouts |
| `src/studio/engine.js` | Shared Model/rasterizer adapter, attachment evaluation, stable per-path morphology streams, per-component surface stream, hit ownership |
| `src/studio/storage.js` | Independent IndexedDB `potion-art-studio`, project transactions and settings |
| `src/studio/direction.js` | Runtime direction, revision and pre-generator descriptor palette transformation |
| `src/studio/screen.js` | Screen lifecycle, editing gestures, hierarchy/property UI, persistence and previews |

A project is JSON `{format:"potion-art-studio",version:1,id,name,assets,palette,direction,updated}`. Assets contain category/folder/tags, seed, 96×96 output, shared components, attachment nodes and three stage scales. Components contain 32×32 source geometry, base/tip anchors, tags and correction layers. Pixels use packed unsigned little-endian RGBA words; 0 means no correction and -1 means erase. Nodes refer to component IDs and parent node IDs; the empty parent is the scene root. Graph validation rejects cycles, dangling references and invalid ranges. IDs remain stable across project export/import and asset duplication; component/node namespaces are asset-local. Import assigns a new project ID to avoid replacing existing projects. Version 0 has one explicit migration adding folder/tags; future versions are rejected.

Limits: 16 MB project import, 64 assets, 64 components per asset, 128 nodes per asset, 32 geometry parts and 16 layers per component, 1M editable pixels per project, 16 repeats per node, 512 generated instances and depth 32. PNGs are limited to 8 MB and 4096×4096 before fitting. Imports reject prototype-bearing keys and do not evaluate scripts or fetch URLs. History is bounded to 60 snapshots / 8 MB (combined undo/redo); oversized edits are rejected with an explanation. A pointer gesture is one history entry; cancelled gestures restore their previous document. Generation-limit truncation is reported in Validation.

The active direction is a separate versioned settings record in the Studio database. No editor project data is added to existing game saves. Default rendering uses the original descriptor builder unchanged. With an active direction the adapter changes packed material ramps before family growth, icons and fragments run. It never changes identity, material definitions, density, viscosity, reactions, temperature, effects or component silhouettes. Cache keys include the art revision; piece/powder palette caches invalidate as well. Apply/Revert act between screens, not halfway through an existing live physics scene.

Drawing requests coalesce into animation frames. Generation/component rasters are memoized independently of pan, zoom and selection; variant thumbnails are generated only when their panel changes. There are no DOM elements per pixel and no continuous animation loop unless stage playback is enabled. Screen unmount disconnects ResizeObserver and removes global listeners, animation callbacks and playback timers. Storage transactions close their database connection when complete.

## Validation commands

```sh
npm run typecheck
npm test
npm run build
PW_CHROMIUM=/usr/bin/chromium npm run test:browser
PW_CHROMIUM=/usr/bin/chromium npm run bench
node scripts/studio-bench.mjs
```

Use the repository's pinned Playwright browser when available; `PW_CHROMIUM` is its existing supported override. Browser reports/screenshots/traces are in ignored `test-results/`. Build and benchmark scripts regenerate tracked `dist/`, `release/` and `docs/perf-results.json`; review these outputs separately from source commits. The source and bundled/offline versions include the editor through the existing bundler, with no new dependencies or external resources.

`tests/studio.test.mjs` checks validation/migrations, deterministic variation, actual component construction, anchors, growth, locks, choices/exclusion/budgets, correction scopes, transparency, transforms, undo/redo, linked visual changes, unchanged physical masks/world data and exact revert. Browser Studio tests exercise real tools, extraction, attachment controls, growth, seed changes, undo/redo, IndexedDB reopen, PNG/project round trips, rejected imports, preview isolation, profile persistence, revert and a pre-Studio-format game save. They run on desktop and phone portrait emulation.

## Remaining implementation (not delivered)

This is a usable foundation, not the master task's complete definition of done. Continue on this branch in coherent units:

- **A/B refinements:** arbitrary canvas sizes, component-level transform selections, lowering/drag ordering of layers, family-wide correction propagation with compatibility checks, richer folder grouping and accessibility testing. The current canvas is intentionally bounded, not a general image editor at arbitrary resolution.
- **C extensions:** freeform polygon point editing, explicit noise/deformation/lighting/material nodes, arbitrary attachment surfaces/orientation constraints, independent palette-variation stream, and worker execution for larger scenes. The current executable hierarchy offers attachment/repeat/choice/symmetry/probability/exclusion/growth, not every operation in the master specification.
- **D:** editable adapters for all native ingredient morphology grammars; bind custom constructions to game species with consistent wild/icon/fragment/powder representations and approved collision behavior. Currently all native ingredient families consume art-directed ramps, but custom component graphs are **not** species replacements in gameplay.
- **E:** actual terrain/region editor. Changes must update `env/scene` solid/open masks, dry surfaces, attachment metadata and creature placement, together with visual layers. No terrain-paint overlay is advertised here.
- **F:** rabbit anatomy/pose/mutation adapter, real material/effect-renderer previews, UI nine-slice/state authoring and environmental props/light composition. Custom asset categories currently organize component constructions; category names do not enable these domain-specific editors.
- **G:** richer reusable named profiles, publishing/import compatibility across generator versions, user-approved structured diff proposals for optional AI, larger-scene performance budgets and the remaining master acceptance scenarios. There is no AI backend, simulated AI output or client-side secret.

Next integration gate: implement one full native ingredient adapter through geometry → growth/icon/fragments → placement-mask checks before adding more disconnected domain controls.
