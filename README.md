# Potion Brewer Studio

A mobile-first pixel-art alchemy game. Explore a seeded world, discover
ordinary and Arcane ingredient species, cultivate their seeds, brew in a
physical particle cauldron, test potions on your animals and run a shop.

The particle simulation remains the source of potion behavior: crushing,
extraction, stirring, layering, reactions, temperature and dilution all matter.

## Develop

Node.js 20 or newer is required (Node 22 and 24 supported). No backend or
credentials are needed. From the repository root:

```sh
npm ci --ignore-scripts
npm run dev
```

The static development server listens on port 5173. Controls work with touch,
mouse and keyboard. The default interface targets phone portrait; Settings
includes resolution and performance presets. The Procedural Art Studio is
available from the main menu.

```sh
npm run typecheck
npm test
npm run build                 # dist/ and release/alchemists-shop-2.4.0-web.zip
PW_CHROMIUM=/usr/bin/chromium npm run test:browser
PW_CHROMIUM=/usr/bin/chromium npm run bench
npm run check                 # typecheck + Node suites + production build
npm run serve:dist            # production server on port 4173
```

If Chromium is not already installed, use `npx playwright install chromium`.
Browser tests include phone portrait, landscape, tablet, desktop, offline
production and GitHub Pages subpaths. Device profiles are emulation, not
physical Android measurements. Benchmarks write `docs/perf-results.json`.

## World and progression

| Category | Biome | Dominant effect | Native creature |
| --- | --- | --- | --- |
| Natural | Whisperwood | Vitality | Fox |
| Natural | Sunlit Meadow | Love | Hare |
| Natural | Willow Bank | Frost | River Otter |
| Natural | Ironstone Quarry | Strength | Rock Beetle |
| Natural | Netherwood | Toxicity | Cave Moth |
| Natural | Ember Crags | Fire | Salamander |
| Exotic | Moonfen | Arcana | Will-o'-Wisp |
| Exotic | Skyshard Archipelago | Levitation | Cloud Ray |
| Exotic | Morphgrove | Transformation | Mimic Lizard |
| Exotic | Veil Hollow | Invisibility | Shroud Moth |
| Exotic | Ghostglass Reef | Phasing | Spectral Axolotl |
| Exotic | Chronoglass Wastes | Temporal Distortion | Hourglass Scarab |

Only Whisperwood is initially unlocked. Sales and guild rank open later
biomes. Acidity, Death and Swiftness also occur in the Natural ecology.
Exotic scenery includes bounded touch interactions: ripples, spring islands,
shape changes, clearing mist, spectral crystals and reversing sandfalls.

Wild populations are finite. They do **not** regrow through waiting, rain,
watering or a new shop day. One Traveller Coin regenerates a biome's scenery,
resources and wildlife. Coins recharge every 25 minutes, up to three; excellent
customers sometimes gift one. Inventory, captured creatures, seeds, recipes,
crops and stored bottles survive regeneration.

The garden opens after a first harvest, which guarantees a compatible starter
seed. Ordinary and Arcane propagules preserve their exact species and rarity.
Soil, fungal, mineral, exotic and Arcane beds support different crops. Watering
helps botanical growth; offline growth is capped at eight hours. Harvesting
consumes the crop. The guided tour accelerates its first planting.

## Ingredient quality and Arcane activation

Rarity is permanent species identity, not a random specimen upgrade:
**Common → Uncommon → Rare → Unique → Legendary**. Increasing potency and
purity are mathematically constrained. Unique and Legendary species have no
secondary effects; Legendary potency has a substantial gap above Unique.

Every species has a rarer **Arcane** counterpart of the same rarity and effect
composition. Only Arcane-origin matter can awaken. Heating or chilling an
ordinary ingredient never amplifies it. Mixtures weight only eligible Arcane
contributions; awakening preserves carried effects and persists after cooling,
bottling and saving. Historical awakenable items are preserved as explicitly
Arcane legacy finds during migration.

See [the system specification](docs/OVERHAUL_SPECIFICATION.md) for parameters,
identities, ecology, asset contracts and migration details.

## Fixed artwork and procedural environments

Shipped ingredient art is loaded from transparent PNG atlases split by biome.
There are 177 ordinary species and their 177 Arcane counterparts, each with
an icon, propagation sprite and five cultivation stages (the seed is shared
with the propagation view): **2,124 native 64-pixel frames**. Inventory and
physical fragments sample the same master artwork. Environments remain
procedural. Locked Exotic atlases are decoded only when needed; the installed
PWA precaches their compressed files to keep the whole world available offline.

```sh
npm run assets:export          # rebuild PNGs from editable master pixels
npm run assets:validate
```

[Asset documentation](assets/ingredients/README.md) explains editable source
rasters, frame metadata, regeneration and the older overview sheets.
Studio ingredient previews inspect these same frames and can explicitly bind
an edited component graph; environment editing still changes shared terrain,
light and placement maps.

## Customers and saves

Immediate customers have visible active-play patience. Waiting reduces offers
and eventually sends them away; suspended time and dialogs do not count.
From Adept, optional special commissions can be accepted or declined without a
penalty. Prepare a complete bottle, keep it on a potion shelf and deliver it
within the displayed game-day pickup window for a larger reward. Multiple
commissions, remaining resources, captured creatures, crops and tutorial
progress persist in versioned saves with rolling backups and JSON export.

The rabbit colony, labels, trial uncertainty, recipe knowledge, potion shelves
and bargaining remain integrated with the original brewing simulation.

## Architecture and delivery evidence

* [Audit and dependency map](docs/OVERHAUL_AUDIT.md)
* [System specification and taxonomy](docs/OVERHAUL_SPECIFICATION.md)
* [Validation, benchmarks and limitations](docs/OVERHAUL_VALIDATION.md)
* [Steam and Google Play preparation](docs/RELEASE_READINESS.md)
* [Simulation architecture](docs/GAME_ARCHITECTURE.md)
* [Art Studio](docs/ART_STUDIO.md)

The web build is an installable offline PWA. Desktop and Android publication
require additional platform packaging, signing and real-device testing; store
approval is not claimed.
