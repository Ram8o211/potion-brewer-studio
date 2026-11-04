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

## Remaining milestones

2. Fixed species catalog and Arcane-only transitions.
3. Authored ordinary/Arcane PNG families, seed/growth assets, atlas loading and studio inspection.
4. Twelve-biome taxonomy, unlocks, Traveller Coins and finite saved populations.
5. Persistent garden and propagation economy.
6. Distinct exotic terrain grammars and touch interactions.
7. Native creatures, habitats and appended effect channels.
8. Patience, scheduled commissions and feasible progression.
9. Contextual tutorial and compact portrait interfaces.
10. Whole-flow QA, optimization, packaging foundations and release checklist.

No physical Android performance, Steam compatibility, store approval or completed
content is implied by browser emulation or passing unit tests.
