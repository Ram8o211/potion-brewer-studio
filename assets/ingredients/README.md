# Ingredient artwork

Gameplay consumes the twelve PNG/JSON pairs in **biomes/**, indexed by
**manifest.json**. There are 177 permanent ordinary species and 177 Arcane
counterparts. Each has a native 64 × 64 icon and five growth frames: seed
(propagation), sprout, young, developing and mature, totaling **2,124 frames**.
The atlas sizes vary with biome population; no atlas exceeds 864 × 1512.
All exports are lossless RGBA PNGs with transparent backgrounds and four-pixel
padding. Geometry is rasterized at native resolution, not interpolated from
small icons. No painted backgrounds or rarity borders are baked into sprites.

## Editable masters

`art/ingredients/<biome>.json` stores each frame as an explicit palette and
run-length encoded pixel raster (`width`, `height`, `palette`, `runs`). Runs
are `[paletteIndex, count, ...]` in row-major order. Edit these pixels to author
species art; ordinary and Arcane masters are independently editable. Frame IDs
are stable species keys with `@arcane` for the variant. The exporter preserves
these source edits by default:

```sh
npm run assets:export
npm run assets:validate
```

`node scripts/generate-ingredient-library.mjs --reauthor` deliberately replaces
masters using the offline family/geometry authoring tools; do not run it over
uncommitted art edits. Native icons use the family geometry at 64 pixels.
Propagation forms distinguish seeds, spores and mineral fragments. Arcane
markings are actual contained veins and runes on the base anatomy, rather than
an effect applied while drawing the game.

## Frame contract and loading

Every frame contains `asset`, `species`, `material`, `rarity`, `arcane`, `biome`,
`atlas`, `rect`, `pivot`, `nativeResolution`, `stage`, `shape` and `name`.
`src/visual/atlas-contract.js` checks bounds, identity, pivot, overlaps and links.
`src/rendering/ingredient-loader.js` loads only needed biome PNGs, checks their
dimensions and registers their pixels in `src/visual/ingredient-assets.js`.
Frame lookup uses species/stage IDs, never scattered frame indices. Startup
loads unlocked biomes and any still-locked biome needed by owned items. A new
Exotic biome's assets load on travel. Offline production precaches the files
without decoding every image into memory at startup.

Inventory uses the master icon. The physical cauldron fragments sample that
same master, with cached nearest-neighbor scaling and rotation. The wilds and
garden use the same fixed species' growth family. Size, placement, rotation and
mount can vary without regenerating an ingredient's palette or anatomy.
The Studio previews these runtime frames and metadata and supports explicit
component-graph overrides. Dynamic remains and legacy art retain compatibility.

## Earlier overview exports

`icons-atlas.*` and `wilds-atlas.*` are the earlier 192-pixel-cell overview
exports, retained for existing links/tools. Their frame keys are material IDs,
and both contain 354 ordinary/Arcane entries. They are **not** the gameplay
loader's source. `scripts/generate-ingredient-atlases.mjs` rebuilds them separately.
The per-biome library and editable masters are the current asset contract.

The supplied image references guide silhouette, biome palettes and clarity.
Further hand-art review is a release gate; native PNGs and automated validation
alone do not certify reference-level commercial polish.
