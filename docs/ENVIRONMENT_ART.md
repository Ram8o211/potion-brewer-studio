# Procedural environment art

The supplied environment and farm reference sheets guide the native pixel renderer. Scenes are still generated from code and world seeds. The same scene composer feeds the Wilds and the Art Studio preview.

## Reference mapping

| Environment | Art direction |
| --- | --- |
| Sunlit Meadow | Blue sky, pale mountain ridges, green crowns, orange soil, moss-capped stone pillars, purple crystal clusters and blue pools. |
| Whisperwood | Copper and orange foreground foliage against cool green background trees, a dark canopy, grassy ledges, roots and flower-lined hollows. |
| Netherwood | Dark blue cavern, teal foliage, purple soil bands, luminous mushrooms and pink/gold hanging bells. |
| Willow Bank | Usually a cave oasis with pale sandy shelves, green ceiling vines, cyan bells, turquoise water and a timber footbridge; some seeds produce an open bank. |
| Ironstone Quarry | Mostly an open sandstone mine, stepped benches, ore pockets, red crystals, timber equipment, carts and warm lamps; some seeds produce a cavern mine. |
| Moonfen | Mostly an open starry ruin, blue stone, mint turf, cold crystals and pale flowers; occasional cave frames remain. |
| Ember Crags | Usually a basalt cavern with warm rock, yellow-green turf, red crystal accents and a lava fall feeding its pool; occasional seeds show volcanic slopes. |
| Farm enclosures | Warm timber and hay, distinct stone/brick/plaster walls, greener outdoor pens, local lantern light and cool snowy runs. |

## Preview

Generate a gallery of all twelve biomes and twenty-one enclosures:

```sh
node scripts/environment-gallery.mjs test-results/environment-gallery reference-garden
```

Open the generated `index.html` to see labelled images. Use a different seed to review composition variations. The gallery uses the real generators, with no browser or image dependencies. Animals, ingredient stands and moving overlays are added by the game, so the base-scene gallery does not include them.

Committed reference-seed previews:

- [Wilds contact sheet](screenshots/reference-environments/wilds-overview.png) — Meadow / Whisperwood, Netherwood / Willow Bank, Quarry / Moonfen, Crags.
- [Enclosure contact sheet](screenshots/reference-environments/enclosures-overview.png) — hutch / cattery, pond / hearth, paddock / sett, dovecote / fox run, snow run / snail garden, cellar.
- [Meadow in the game](screenshots/reference-environments/game-desktop-meadow.png).
- [Netherwood in the game](screenshots/reference-environments/game-desktop-netherwood.png).
- [Phone layout](screenshots/reference-environments/game-phone-meadow.png).
- [All seven biomes in Free Experiment at phone size](screenshots/reference-environments/game-phone-wilds.png), including ingredients, animals and animated light overlays.
- [Netherwood in Art Studio](screenshots/reference-environments/editor-netherwood.png).

## Shared drawing rules

`stone.js` draws tightly packed, irregular cobbles with chipped corners, thin joints and five lighting tones. A shallow dome, mineral chips and short cracks give each face volume. Soil has small clods and pebbles; sand has sparse grain and broken ripples; sandstone has weathered bedding lines. Turf highlights break into short clumps. Timber bevels and grain follow each beam's direction.

`foliage.js` builds crowns from overlapping leafy facets, small leaf planes and dark notches, with broken highlights. Materials remain seeded, and foliage retains the existing wind and touch groups.

The biome composers choose material ramps, terrain layers, scenery, local lights and background depth. Blue and teal cavern columns separate the foreground from the dark backdrop. `side.js` adds palette-matched water/lava reflections and gentle background sun shafts. The final grade and vignette preserve visible midtones in dark environments. Enclosures use the same stone and grade with their own timber, grass and wall materials.

`lighting.js` accumulates local lights before shading, using a bounded material response so overlapping sources preserve stone facets and foliage texture. Terrain and cave walls catch the light and shade its direct spill, with a small amount of scattered bloom around ledges. Background air receives a soft coloured glow. The still painting, the background revealed by wind, and the individual wind layers are shaded consistently; a calm frame reproduces the painting exactly. Light and shadow are baked once when composing a scene, while the runtime overlay adds a quieter flicker.

Solid terrain, liquids, open surfaces, prop claims, tree attachments and animal walking areas remain separate structural maps. Newly placed decorative crystals use the existing placement/claim checks. Editor terrain strokes, custom props, lights and saved art profiles continue through the existing rendering pipeline.

## Overhaul checkpoint

The twelve-biome renderer and native domestic habitats are documented in
[STUDIO_OVERHAUL.md](STUDIO_OVERHAUL.md). Its [current contact sheet](screenshots/overhaul/wilds-overview.png)
includes the five new exotic scenes; the older reference gallery above remains
a record of the preceding material-lighting pass. Live portrait verification
is pending because the available Chromium process crashes before page creation.
