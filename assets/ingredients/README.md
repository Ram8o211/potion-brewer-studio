# Potion Brewer Studio — Ingredient Atlases

Two **transparent RGBA PNG sprite atlases**, generated directly from the game's native Noita-style procedural ingredient renderer, plus machine-readable JSON frame maps:

| Asset | Purpose | Contents |
| --- | --- | --- |
| wilds-atlas.png + wilds-atlas.json | Mature wild plants, mushrooms, hanging fruits, minerals, crystals and other deposits, with their natural mounting orientation | One normal and one Arcane wild appearance per species |
| icons-atlas.png + icons-atlas.json | Isolated ingredient icons for inventory, book, market and garden menus | The exact icon silhouette and palette already used by the game |

Both PNGs are **3456 × 3840 pixels**, contain **354 separate 192 × 192 transparent RGBA cells** (177 catalog/legacy species plus 177 Arcane counterparts), and have **no painted background, text labels, grid, cards, or shadows outside the actual rendered sprite**. Sprite edges use nearest-neighbour integer scaling. A source sprite is cropped to its nontransparent bounds, uniformly scaled, and fitted into its cell with padding. Both atlases use the same sprite ordering.

### Coordinates and identity

Each JSON manifest conforms to src/visual/atlas-contract.js. Its frames object is keyed by the actual material ID, for example wild-silverleaf and wild-silverleaf@arcane. The species field is the invariant unawakened species key; arcane distinguishes the counterpart. Use rect: [x, y, width, height] to crop the sprite; artRect is the artwork's placement inside the cell. Pivot expresses the ground, ceiling or wall attachment point for wilds (icons are centered). Rarity, biome, shape and name come from the live materials catalog.

For Canvas2D, set imageSmoothingEnabled = false before drawing:

~~~js
const f = atlas.frames[material.id];
context.drawImage(image, ...f.rect, destinationX, destinationY, spriteWidth, spriteHeight);
~~~

The **wilds** images are mature snapshot assets (stage: mature); growth animations, other procedural mounting variants and world-specific editor overrides continue to be handled by plantFrame() at runtime. Icons are generated with iconFrame() — not painted approximations — so menu sprites match the same materials.

### Rebuild and validation

From the repository root:

~~~sh
node scripts/generate-ingredient-atlases.mjs
node --test tests/ingredient-atlases.test.mjs
~~~

No native graphics libraries, external fonts or network access are required; only Node.js and the existing game modules. An associated GitHub workflow regenerates and commits atlas PNGs and JSON files when the exporter changes on its work branch. The PNG encoder emits standard 8-bit RGBA with alpha channel, PNG filter 0 and lossless zlib compression.

**Art direction:** Small, crisp, textured pixels are deliberate. Never add checkerboard backgrounds to the PNGs; display a checkerboard only in a preview UI if alpha needs to be demonstrated.
