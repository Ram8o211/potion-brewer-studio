# Gameplay and asset overhaul audit

The dependency path is `materials/catalog + rarity → materials/wild → generator →
GameState → gathering/garden/commissions → UI`; `alchemy/effects + arcane →
simulation/species + reactions → measurement/prediction → trials/evaluation`.
Rendering consumes the same species and biome definitions. The Studio publishes
runtime profiles through `studio/direction`, not a separate game implementation.

## Existing at the start of this change

* Twelve Natural/Exotic biomes, stable seeded instances, native species and pens.
* Five nonoverlapping rarity intervals and 120 new catalog species, alongside
  compatible earlier species; ordinary and Arcane material definitions.
* Arcane-only particle conversion, carried-effect amplification, negative and
  weighted thresholds; fifteen effect channels with append-only save indices.
* Finite wild populations, regeneration with Traveller Coins, deterministic seed
  rolls, persistent gardens and specialist beds, v8 legacy-material migration.
* Natural terrain contours, material textures, cached lighting, exotic grammars
  and bounded touch interactions; mobile bottling placement and compact views.
* Exported icon/wild PNGs and metadata. These were **not used by gameplay**;
  growth stages and species propagation sprites were missing.

## Integration gaps addressed

* Connect shipped artwork to inventory, wilds, garden, cauldron and Studio;
  partition assets by biome, provide native detailed icons, seeds and five
  growth stages, validate completeness and image integrity.
* Replace outdated tutorial instructions about ordinary awakening and wild
  regrowth with guaranteed exploration, fox, garden and Arcane onboarding.
* Add active-play customer patience and persistent multi-day special orders,
  including acceptance, refusal, storage, pickup and rewards.
* Validate progression, save/reload and resource integrity for these paths;
  capture current biome/garden/atlas screenshots and benchmark evidence. Fix
  retained closed screens and the repeating gutters in Veil Hollow's fog.
* Document Web/desktop/Android packaging and the remaining real-device/store
  requirements honestly. No automatic publication or default-branch merge.

See `OVERHAUL_VALIDATION.md` for final evidence and limitations.

## Roadmap coverage

| Requested milestone | Existing implementation retained | Work delivered in this branch |
| --- | --- | --- |
| Architecture and visual foundations | Continuous terrain contours, material-specific textures, cached lighting, mobile bottle placement | Runtime atlas contract, lazy decoding, shared source sampling, ambient particles and textured moving islands |
| Rarity and Arcane variants | Five constrained fixed tiers, ordinary/Arcane definitions, Arcane-only weighted physical activation | Corrected independent rarity draws, statistical sampling and progression gates for Exotic channels |
| PNG production | Legacy overview exports | 12 biome sheets, 2,124 native frames, editable masters, deterministic export, real runtime integration and Studio inspection |
| Biomes and Traveller Coins | 12 biomes, unlocks, finite campaign deposits, recharge/regeneration and saved ecology | Preserved instance identities and resources; removed the obsolete sandbox watering controls |
| Personal garden | Seeds, fixed crop identity, moisture, facilities, upgrades and offline growth | Real PNG stage/soil views, seed preview, bulk watering and a one-use starter growth bonus |
| Exotic environments | Six distinct grammars, native creatures and bounded touch interactions | Native artwork for interactive islands/flora/coral, particles and matching Studio controls |
| Creatures and magical effects | Native pens, persistent collection, 15 effect channels, trials and potion feedback | Three additional seeded resonance laws; existing-world laws preserved |
| Customers and progression | Feasibility-based orders, shops, ranks, economy and potion shelves | Active-play patience, personality/complexity modifiers and persistent optional multi-day commissions |
| Tutorial and interface | Working dose tools, trials, bottling, sales and compact room navigation | 24 contextual steps with guaranteed seed/fox/Arcane resources; safe replay, saved progress and compact metadata |
| Optimization and release | Static build, scoped offline worker, quality presets, backups/import/export | Asset caching, profiling/evidence, CI, benchmark comparison, 2.4.0 web package and platform evaluation |

Commercial art acceptance, physical Android performance and signed native/store
releases remain explicit release gates. They are not inferred from automated
web checks or the existence of exported PNG files.
