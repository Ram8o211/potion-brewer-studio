# Complete atlas integration, cultivation onboarding and scheduled orders

Shipped ingredient PNGs were disconnected from gameplay, and the first tour
still described obsolete awakening and wild-regrowth rules. This change makes
the fixed artwork the shared source for inventory, wilds, garden and physical
fragments, and guides the real exploration/cultivation/Arcane brewing loop.

* Ship twelve biome PNG/JSON pairs and editable palette/RLE masters: 177 species
  and their Arcane counterparts, with 2,124 native 64×64 icon/propagation/growth
  frames. Load needed biomes, owned items and seeds lazily; preserve legacy art
  and explicitly bound Studio constructions.
* Correct finite-population rarity sampling and late Exotic-effect access while
  retaining saved rosters and intrinsic profiles. Bound the one-use tutorial
  crop bonus and add three seeded resonance laws without rewriting saved laws.
* Add active-play customer patience and optional persistent multi-day
  commissions with acceptance, refusal, pickup windows and atomic validated
  stored-bottle delivery. Save v9 preserves existing inventory and records.
* Add the contextual 24-step tour, garden stage/soil/seed views, compact rarity
  and seed metadata, commission controls and shared Studio interaction previews.
  Fix gesture coordinates, custom fragment art precedence, advice refresh,
  continuous Veil fog and retained canvas observers/prewarming timers on exit.
* Build a 2.4.0 Web/PWA package whose offline cache also changes for asset-only
  edits, plus reproducible asset export and three-shard browser CI.

Validation and measured limits are recorded in
[OVERHAUL_VALIDATION.md](OVERHAUL_VALIDATION.md), with
[runtime screenshots](screenshots/overhaul-v2/README.md),
[the implementation audit](OVERHAUL_AUDIT.md) and
[the species/system specification](OVERHAUL_SPECIFICATION.md).
Checks cover type checking, 276 Node tests in 33 files, PNG integrity/export
reproducibility, 166 passing desktop/touch/landscape/tablet/offline/subpath
browser cases (plus two explicit seeded-mineral skips), a complete first tour,
physical brewing, strict screen-lifetime checks and isolated performance/memory
benchmarks.

The corrected memory follow-up reduced collected heap after ten menu/shop
trips from 22.97 to 12.42 MB. Cloud software-rendered frame rates do not establish
the requested 60 FPS/mobile performance target; real hardware remains a gate.

The release artifact is the web build. Physical Android performance and first
tour testing, final commercial art acceptance, native shells/storage/signing and
Steam/Google Play certification remain platform release gates described in
[RELEASE_READINESS.md](RELEASE_READINESS.md).
