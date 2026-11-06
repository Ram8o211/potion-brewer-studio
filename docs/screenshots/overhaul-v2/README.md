# Runtime visual evidence

Captured with `PW_CHROMIUM=/usr/bin/chromium node scripts/overhaul-evidence.mjs`
against the development server. These are actual game/Studio rendering pixels,
using the shipped PNG ingredient registry and procedural scenery.

* `forest.png` through `chronoglass.png`: all twelve biomes in the unrestricted
  sandbox, seed `experiment`, with the full scene fitted into view.
* `forest-regenerated.png` and `regeneration.json`: a new saved instance seed,
  changed species population and one spent Traveller Coin; inventory preserved.
* `garden-stages-desktop.png`, `garden-stages-phone.png` and the phone bottom
  view: a controlled five-crop fixture for seed, sprout, young, developing and
  mature artwork. The last crop is Arcane. Stage values are set explicitly for
  comparison; timed growth and save/reload are tested separately.
* `ordinary-arcane-rarities.png`: one species per biome and tier, ordinary next
  to its same-rarity Arcane counterpart, sampled directly from the registry.
  This is a coverage gallery, not a screenshot of normal inventory access.
* `arcane-awakening.png`: the physical cauldron after an actual Arcane Silverleaf
  conversion, captured by the passing desktop showcase browser test.

Phone captures use a 390×844 viewport. They are browser emulation, not physical
Android certification. Visual inspection covers crisp edges, contrast, native
silhouette preservation, growth differences and scenery/material readability.
Further art direction against the supplied commercial references remains a
human release review gate.
