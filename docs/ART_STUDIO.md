# Procedural Art Studio

Open **Procedural Art Studio** from the game's main menu. **Editor workspace** switches between seven integrated editors. They share a project, component library, undo/redo, portable files, and the profile applied to the actual game. No external editor or new dependency is required.

## Components and executable rules

Draw reusable 32×32 components with pencil/eraser, square/round brushes, lines, rectangles, ellipses, fill, eyedropper, rectangle/lasso/contiguous selections, correction-layer move, copy/paste, flip, rotation and nearest-neighbour scaling. Layers have visibility, opacity, ordering and all-variant / exact-seed / growth-stage scopes. PNG import preserves transparency; erasing is an explicit cutout distinct from untouched pixels. Zoom is pointer-centred, pan supports Space/drag or the Pan tool, and coordinates remain image-relative at every zoom and device pixel ratio.

Source geometry, procedural shading and pixel corrections remain separate. Polygon geometry can be edited directly with **Vertex**; Base/Tip tools set attachment anchors. The inspector controls geometry dimensions/position, procedural texture, lighting, organic deformation and independent seeded palette variation. Importing native ingredient geometry preserves its polygonal parts as editable source geometry rather than flattening everything to a screenshot.

Select pixels and **Extract selection as component**, then attach that component through the executable Rules hierarchy. Children inherit parent transforms and anchors. Rules control component selection, branching, repetition, spacing, probability, weighted choice groups, mirroring, angle variation, stage participation and pixel-overlap exclusion. Locking a rule fixes its local random stream and growth scale; moving a parent still moves its children. Select/drag generated instances to edit their attachment positions, or drag components into the generated preview to create root attachments.

Growth uses one structure at **Sprout → Ripe → Mature**. Variants offers six deterministic seeds and preserves manual correction layers. Before/after comparison captures the previous construction. A graph shared by several species is a reusable procedural family: corrections to its components propagate to all those species without inferring semantics from arbitrary paint strokes.

## Ingredients and growth

Select any native ingredient in **Ingredients & growth**. The editor exposes the actual family's numeric, boolean and textual morphology/growth parameters, a preview seed, growth stage, the icon and all four physical fragments. The same native descriptors and growth functions used by gameplay render these previews.

**Game construction** selects either the native family grammar or a custom component graph. **Use current component graph for this species** binds the current asset; **Use current graph for this native family** shares it across related species. **Extract native icon geometry** adds its editable source parts to the component library. Native herbs, roots, flowers, fruit, fungi, moss, reeds, bark, shells, minerals and crystals retain their native generation paths unless overridden.

Custom bindings reach plants, inventory artwork, icon-derived shards, physical piece silhouettes and powder palettes. Their ground, hanging and mirrored wall anchors follow the game's placement conventions. Geometry changes intentionally change the authored silhouette; density, viscosity, alchemical properties, stock, progression and saved identity records are not edited.

## Environments and terrain

**Environments & terrain** uses the actual seeded composer for all seven regions. Paint rock, soil, water or lava; erase to open a cavity. Painting updates solid, liquid, rock/cave, strata, grass/open-surface, prop and occlusion metadata along with the pixels. Plants and wildlife therefore use the edited terrain maps rather than an unrelated image overlay. The mask display shows solid areas and legal dry attachment surfaces.

Choose **place** and an asset to place a graph-generated tree, vegetation, building or prop. It snaps to a dry surface and is rejected if its opaque pixels intersect terrain, water, rock or another prop. Inspector controls move/scale/remove the object. Locked objects keep their seed while the surrounding world is regenerated. Validation reports when no legal location is available.

Choose **light** to add a localized source; edit position, radius, color and strength in the inspector. These sources enter the composer's native lighting queue. Region lighting and tint, native vegetation density and atmospheric density are also editable. Density affects native tree generation before rasterization. Source seeds can be varied without moving locked composition objects.

## Creatures and animation

**Creatures & animation** previews all eleven native animal kinds through the existing anchor-based renderer. Body/head/ear/limb/tail proportions remain in the original visual frame and keep the foot/collision contract. Fur colors and native patterns can be overridden independently of genetics.

Select the native pose timeline, playback speed, and pose-specific head/ear keys. The moving preview includes effect levels, injuries, death and permanent mutations such as horns, wings, scales and extra eyes. These controls author graphics; they do not dose, injure, breed or otherwise change real game animals. Preview snapshots never enter game saves.

## Materials and magical effects

**Materials & phases** runs an isolated real Simulation and Renderer. Preview liquids, powders, paste, whole solids, gas and frozen samples, including heating, cooling and crushing. Phase-specific tint, opacity, grain, emission/brightness and visual shimmer speed modify only the renderer's RGBA buffers. Simulation particle positions, density, viscosity, temperature and reaction rules are untouched by the visual adapter.

**Magical effects** uses the real PotionParticles renderer for all ten effects. Author color, opacity, texture, emission, population density, particle size, animation timing and native/square/spark/cross marks. Caps and clipping remain in the native particle system. The material adapter preserves the effect pixels so changing a liquid does not recolor its independently authored magic.

## Interface and icons

**Interface & icons** binds graph artwork to every native icon and to nine-slice frames/buttons. It also controls panel, accent and text colors, border width and transition timing. Enable the interface profile to apply these decorations to the game. Native event handlers and responsive layouts remain separate.

The responsive sample supports 320/390/820 px widths and live normal, hover, pressed and disabled states. The actual icon cache and generated game markup use the same profile. Revert removes the custom stylesheet and restores the native icons. The Studio's own editing controls remain legible under any game theme.

## Save, preview, apply and revert

**Projects** creates, renames, duplicates, loads and deletes projects. Assets support categories, folders, naming and tags; search matches all of them. Panels resize/collapse and retain their layout preferences.

**Save Draft** writes editable documents to the independent `potion-art-studio` IndexedDB database. **Export Project** makes a portable backup. Version 2 stores components, geometry, correction layers, graphs, stage data, art-direction presets, native overrides, terrain strokes, locked objects/lights, creature pose keys, material/effect settings and interface bindings. Versions 0 and 1 migrate without changing existing component artwork; future or malformed versions are rejected before state replacement.

**Preview in Game** saves the draft and opens a disposable unlimited experiment with the compiled profile. Return restores the previously applied profile. Preview writes neither shop nor sandbox progress. **Apply Art Profile** persists the compiled data used by subsequent game screens and sessions; **Revert** restores native graphics while retaining the draft. Cache revisions invalidate descriptors, plant/icon canvases, pieces/powder palettes, region frames, creature sprites and UI icons.

Art-direction precedence is global → biome → family → species; component artwork is an explicit authored override. Save/load named style presets in the component inspector. Sharing one graph across species shares its anatomy and correction layers, while its per-node morphology and per-component surface/palette streams remain deterministic.

## Optional assistant interface

There is no fabricated AI connection or embedded API secret. A provider can use `makeProposal(current, candidate)` from `studio/proposals.js` to return a `potion-art-proposal` file. It contains a versioned complete candidate and the SHA-256 of the source draft. Importing it shows a structured diff and before/after construction; only **Apply proposed changes** changes the document. Stale-base proposals and invalid projects are rejected. All tools work without a provider.

## Architecture and bounds

- `model.js`, `domain-model.js`: portable schema, migrations, constraints and bounded undo history.
- `engine.js`, `pixels.js`: shared material rasterization, geometry, independent random streams, layer composition and executable attachments.
- `direction.js`, `asset-runtime.js`: applied profiles, isolated editor rendering scopes and graph-backed game frames.
- `environment-runtime.js`, `creature-runtime.js`, `material-runtime.js`, `interface-runtime.js`: adapters to native structural/rendering systems.
- `screen.js`, `workspaces.js`: one screen lifecycle, shared authoring operations and domain UIs.
- `storage.js`, `proposals.js`: independent persistence and optional reviewed structured proposals.

Import is bounded to 16 MB, 64 assets, 64 components/asset, 128 rules/asset, 16 layers/component and 1M editable pixels. Components are 32×32 and graph outputs 96×96; imports fit those authoring cells. Geometry has at most 64 points/part; graphs are bounded to 512 instances and depth 32. Terrain has at most 512 strokes and 128 placed objects per region; localized lights cap at 64. PNG headers are checked before decoding. Prototype-bearing keys, dangling graph references, cycles, invalid domains and non-finite values are rejected. Undo/redo shares a 60-snapshot / 8 MB budget.

Native environment composition runs in a coalescing module worker (including offline), with stale results discarded and a synchronous fallback if workers are unsupported. Rendering is coalesced and cached; static domain rasters do not regenerate for every pan. Preview animation uses the native renderers, releases references on unmount and closes storage transactions. Scene bitmaps are retained across animation frames. The custom static bundler includes every editor offline. Physical-device testing, unlimited-resolution painting and an external model provider are not claimed.

## Validation and Pages

See [validation results](ART_STUDIO_VALIDATION.md). Standard commands are `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser`, `npm run bench` and `node scripts/studio-bench.mjs`. `PW_CHROMIUM=/usr/bin/chromium` is the repository-supported browser override.

The tracked source and `dist/` support branch-based GitHub Pages under `/potion-brewer-studio/`; the release archive contains the same bundled application. Merge to the configured Pages branch synchronizes both copies. Publication is verified separately from local build/test success.

Workspace screenshots: [ingredients](screenshots/art-studio-ingredients.png), [environment](screenshots/art-studio-environments.png), [creatures](screenshots/art-studio-creatures.png), [materials](screenshots/art-studio-materials.png), [effects](screenshots/art-studio-effects.png), [interface](screenshots/art-studio-interface.png).
