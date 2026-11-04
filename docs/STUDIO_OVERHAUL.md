# Potion Brewer Studio overhaul

This is an incremental implementation record, not a declaration of release readiness.
Base: main `b6af4cb8af54b8bf37ab82d127e7bc2d5d9cb99a` (3 November 2026).

## Audit and dependency map

The application is a dependency-free ES-module game with a custom bundler,
Canvas2D rendering, a fixed-step particle solver, a headless simulation-driven
commission planner, versioned saves and a shared procedural graphics studio.
`node scripts/dependency-audit.mjs` regenerates the complete file and layer graph
in `docs/dependencies.json` before architectural changes.

| Owner | Dependencies and consumers | Constraint for this overhaul |
| --- | --- | --- |
| materials/generator, wild, profiles | alchemy; consumed by game, simulation, studio | Saved species IDs and physical properties must remain resolvable |
| alchemy/effects, arcane | core; consumed by species table, predictor, trials | Append effect channels; never reorder old vector positions |
| reactions/species, simulation | materials, alchemy, core | Keep conservation, extraction, phase and rigid body mechanics |
| game/gathering, state | materials, predictor, colony | Separate biome identity from a saved generation instance |
| visual/env | pixels, noise, shared studio runtime | Rendering and placement must share solid/open/liquid maps |
| visual/identity, render, pieces | species taxonomy and studio runtime | Existing runtime ingredient art requires replacement by authored atlas frames |
| rendering/species-sprites | visual frame and piece caches | Inventory, wilds and poured pieces must resolve the same species asset |
| studio | runtime environment, creature and asset adapters | Do not introduce a separate preview engine |
| ui/lab, views | game rules and rendering | Preserve mobile touch targets and physics input |

Existing constraints: saves v6; seven environment composers; ten effect channels;
world-dependent ingredient effects, names and visuals; intrinsic awakening on
ordinary ingredients; automatic wild regrowth and watering; mature wild resources
included in request feasibility; a multi-kind animal colony and bottle storage.
These are explicit migration points, rather than independent greenfield systems.

## Milestone 1 — architecture and visual foundations

Implemented: per-art-pixel terrain contours and cave masks, broad lobe geometry
with smaller mineral chips, irregular material seams, cache revision 15, and a
Bottle control on the left of the brewing view so the rendered receiving bottle
at the right-hand tap remains visible. Existing material-specific texture and
occluded light passes remain in use. Rarity definitions and strict atlas metadata
validation establish the next implementation's shared contracts.

The five tiers have disjoint dominant-magnitude intervals: Common 16–26,
Uncommon 30–40, Rare 50–65, Unique 80–95, Legendary 160–200. These are intrinsic
potencies before extraction and dilution, not guaranteed measured concentrations.
The potion saturation/opposition laws still decide the final effect. Full
constraints are executable in `src/materials/rarity.js`.

### Final verification on 4 November 2026

Corrected the invalid-rarity fixture's tuple type so this foundation branch
passes independently of later milestones. `npm run check` passes TypeScript,
all **245 unit tests**, production bundling and ZIP packaging. The committed
bundle and service worker now include the terrain and bottling changes.
All **10 desktop and portrait-phone layout tests** pass in Chromium 141,
covering the menu, brewing controls, every room, sandbox and overlays.

## Milestone 2 — species, travel, cultivation and native ecosystems

Implemented on `overhaul/02-species-arcane`, based on the merged foundation
PR #9. The checkpoint includes the previously uncommitted work and its repaired
integration. Source changes and the production package are kept together.

- 177 permanent ingredient species, each with an ordinary and Arcane form
  (354 raw material definitions). Every biome has two authored catalogue
  identities in each rarity tier. Rarity, effects, names and visual identity
  persist across regenerated biomes and different world seeds.
- Only Arcane material contributes to awakening thresholds. Its carried
  effects amplify; ordinary ingredients and ordinary remains do not awaken.
  The fifteen effect channels append to the original ten vector positions.
- Save v8 archives pre-overhaul material definitions and rewrites references
  in inventory, recipes and bottled/cauldron compositions. Legacy stock stays
  on the brewing shelf with its exact properties and cannot be repurchased.
- A new campaign opens Whisperwood only. Rank and successful sales unlock
  the other eleven biomes. Traveller Coins regenerate one saved population
  and terrain seed; inventory, garden, seeds and intrinsic quality survive.
  Three coins recharge at one per 25 minutes, with a chance of customer gifts.
- Campaign plants and wildlife are finite. Waiting, weather, another shop
  day or reloading cannot replenish them. Captured animals, injuries and
  deaths survive saving. The Free Experiment opens every biome, retains
  accelerated plant growth and watering, and regenerates without a coin cost.
- A persistent personal garden starts with three beds and a compatible
  Silverleaf starter. Rarity-dependent seed drops preserve exact ordinary
  or Arcane identity. Soil, fungal, mineral, exotic and Arcane facilities
  enforce compatibility; watering accelerates living crops; harvesting
  consumes a crop once. Offline progress is bounded to eight hours.
- Five additional terrain composers use the existing terrain, lighting and
  placement maps. Morphgrove has flowering trees and pools; Veil Hollow has
  hanging growth and ruins; Ghostglass has branching coral and water;
  Chronoglass has sand terraces and arches; Skyshard has detached islands.
- Six exotic signatures respond to touch: moonlit ripples, spring islands,
  shape changes, clearing mist, phasing crystals and reversible/accelerated
  sandfalls. Inputs and particle counts are bounded. A keyboard-accessible
  scenery button invokes the same interaction.
- Twelve native species have matching steady trial channels and dedicated
  anatomy where needed. Their domestic enclosures reuse the farm's material
  and furniture grammars. Existing captured legacy species remain supported.
- New effect requests include speed, levitation, invisibility, phasing and
  temporal distortion, plus coherent combined requests. Feasibility uses
  actual available stock and unlocked resources. The helper search is bounded
  and the least-squares inner loop no longer recomputes quadratic totals.
- Larger specimens are placed first to reduce overlapping resource sprites;
  regenerated visual identities now reconstruct consistently after loading.
  Wilds captions describe finite populations and garden cultivation.

### Validation on 4 November 2026

`npm run check` passes: type checking, **261 tests**, production bundling and
`release/alchemists-shop-2.3.0-web.zip`. This includes real simulation brews of
reference recipes, ordinary/Arcane separation, legacy saves, finite travel,
seed statistics, garden persistence, native population persistence and exotic
interaction stability. The dependency audit has no static import cycles.

Updated tests distinguish campaign finite populations from the retained sandbox
regrowth engine and stock a progressed collector explicitly for advanced recipe
checks. The procedural colour check compares the shared texture palette: a
white fruit and its green leaves need not have the same dominant colour.
The cold-composition timing check allows concurrent-suite contention; standalone
composition timings are recorded by the gallery generator.

The original cached Chromium was truncated. A fresh pinned Chromium 141 now
launches correctly. Finalization also repairs the Garden room's missing display
rule and parchment contrast, enables regeneration as soon as a Traveller Coin
recharges, connects excellent-customer coin gifts to one-use saved follow-ups,
and removes regrowth advice from finite campaign harvesting.

`npm run check` now passes **263 unit tests**, TypeScript and production/ZIP
packaging. All **16 desktop and portrait-phone layout/ecology browser tests**
pass, including a real pointer harvest, garden planting/watering/harvesting,
save/reload, finite wildlife and resource depletion, coin recharge/regeneration,
and all six exotic interactions. Physical Android and sustained frame timing
remain separate release acceptance work.

The complete first-commission phone flow also passes: pour, crush, stir, steep,
trial, bottle, label, negotiate, sell and save/replay the recipe. Seven production
browser checks pass for offline game and Studio use, repository sub-paths,
isolated service-worker scopes, stale-tab saves and cache updates after redeploy.
The garden flow passes again after the final contrast correction.
An [actual portrait garden capture](screenshots/overhaul/garden-phone.png)
records the final interface.

Actual runtime-renderer previews:

- [Twelve biome paintings](screenshots/overhaul/wilds-overview.png), read across
  each row: Whisperwood/Meadow, Willow Bank/Quarry, Netherwood/Ember Crags,
  Moonfen/Skyshard, Morphgrove/Veil Hollow, Ghostglass/Chronoglass.
- [Domestic enclosures](screenshots/overhaul/enclosures-overview.png).
- [Native adults, young and remains](screenshots/overhaul/native-creatures.png),
  read across: Fox/Hare, Otter/Beetle, Cave Moth/Salamander, Wisp/Cloud Ray,
  Mimic Lizard/Shroud Moth, Axolotl/Hourglass Scarab.

These are deterministic pixel renders, not screenshots of a running browser.

## Next work and remaining milestones

The next active task is the authored PNG ingredient pipeline. The current
catalogue still uses the shared procedural ingredient renderer; atlas metadata
validation alone does not replace it. Existing generated art references have
not been silently treated as production sprite atlases.

| Milestone | Status |
| --- | --- |
| 2. Fixed catalogue and Arcane-only transitions | Implemented; tested |
| 3. Authored PNG families, seed/growth assets, atlas loading and studio inspection | Next; pending |
| 4. Twelve biomes, unlocks, Traveller Coins, finite populations | Implemented; desktop/portrait browser flows pass |
| 5. Garden and propagation economy | Implemented; further visual polish pending |
| 6. Exotic terrain and touch signatures | Implemented; all six controls pass desktop/portrait browser checks; final art review pending |
| 7. Native creatures, domestic habitats, appended effect channels | Implemented; further art/animation polish pending |
| 8. Real-time customer patience, optional multi-day commissions and progression tuning | New effect requests integrated; timers and commission scheduling pending |
| 9. Contextual tutorial and compact portrait interfaces | Garden entry and Wilds captions integrated; room layout checks pass; tutorial rewrite pending |
| 10. Whole-flow QA, optimization, platform packaging and release checklist | Unit/build verification complete for this checkpoint; remaining release work pending |

The two existing pull requests are finalized under the user's explicit
request of 4 November 2026. Their completion does not complete the later overhaul
milestones or imply physical Android performance, Steam compatibility or store
approval. Platform publication remains separate from repository integration.
