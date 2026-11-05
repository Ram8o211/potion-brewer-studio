# World, ingredient, Arcane and cultivation specification

Definitions are data-driven in src/game/biomes.js, src/materials/catalog.js,
src/materials/wild.js, src/materials/rarity.js and src/game/native-species.js.
The dependency graph in dependencies.json contains the complete import map.

## Intrinsic rarity (native potency units)

Potency applies before extraction, dilution, opposition and saturation.
There are 177 ordinary species plus an Arcane counterpart for each.
Rarity is a species property: no regeneration, specimen or garden upgrades it.

| Tier | Dominant range | Secondary count | Each secondary/primary | Spawn weight | Seed chance | Value multiplier | Growth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Common | 16–26 | 1–2 | 0.3–0.75 | 70 | 35% | 1× | 5 min |
| Uncommon | 30–40 | 1–2 | 0.08–0.25 | 24 | 22% | 1.8× | 12 min |
| Rare | 50–65 | 1–1 | 0.02–0.06 | 5 | 10% | 4× | 30 min |
| Unique | 80–95 | 0–0 | 0–0 | 0.9 | 4% | 10× | 120 min |
| Legendary | 160–200 | 0–0 | 0–0 | 0.1 | 1% | 30× | 360 min |

The Unique maximum (95) is well below the Legendary minimum (160).
The validator rejects magnitude, count, ratio and dominant-identity violations.
Species profiles are seeded by permanent species ID, independently of world or
biome-generation seeds. Secondary effects retain their signs (acid/alkali).
Rarity visual classes are natural, distinctive, complex, singular and signature.

Population generation draws an eligible rarity by its weight, then a species
from that tier with an 8× preference for the biome's dominant effect. Repeated
draws increase specimen counts, bounded to six; they never create a new species
identity. Ordinary specimens outnumber Arcane specimens. The first Whisperwood
instance guarantees Silverleaf and an Arcane introduction.

## Arcane variants and activation

Arcane is orthogonal to rarity. Base effects, anatomy and intrinsic quality are
preserved. PNGs add contained luminous veins and runes to the same silhouette.

| Base rarity | Relative Arcane spawn probability |
| --- | --- |
| common | 6% |
| uncommon | 4% |
| rare | 2.5% |
| unique | 1% |
| legendary | 0.4% |

Exotic biomes multiply the Arcane spawn probability by 1.5. Variant seed drops
are multiplied by 0.35. Only arcaneVariant=true materials with finite
thresholds can awaken; normal matter never contributes activation eligibility.
A blend weights unawakened Arcane contributions by volume. Temperature maps
as T = 20 + 0.1 × threshold (°C), with positive thresholds reached by heating
and negative thresholds by cooling. Only that material's carried effects are
amplified. Awakened species keep their IDs ending in ~a and persist through
cooling, extraction, bottling and saves. Ordinary unrelated effects are not
amplified. The first tour guarantees one 25 ml Arcane practice portion without
repeated grants on reload.

Natural channels: vitality, strength, love, fire, frost, acidity, toxicity, death, swiftness.
Exotic channels: arcana, levitation, transformation, invisibility, phasing, temporal.
New worlds also include Tailwind (swiftness supports levitation), Deep Veil
(arcana supports invisibility) and Temporal Anchor (time suppresses phasing)
as possible seeded resonance laws. Existing saves retain their embedded laws.
World generation version 3 identifies the new law pool.
The first ten historical effect-vector indices stay unchanged; new channels
are appended. Oppositions remain fire/frost, vitality/death, life/poison and
signed acidity. The same extraction/effect functions feed prediction, testing,
customer evaluation and physical simulation.

## Biomes, creatures and unlocks

| Biome | Class | Effect | Native creature | Rank / sales | Touch interaction |
| --- | --- | --- | --- | --- | --- |
| Whisperwood | natural | vitality | fox | 0 / 0 | foliage/harvesting |
| Sunlit Meadow | natural | love | hare | 0 / 1 | foliage/harvesting |
| Willow Bank | natural | frost | otter | 1 / 3 | foliage/harvesting |
| Ironstone Quarry | natural | strength | beetle | 1 / 5 | foliage/harvesting |
| Netherwood | natural | toxicity | cavemoth | 2 / 8 | foliage/harvesting |
| Ember Crags | natural | fire | salamander | 2 / 12 | foliage/harvesting |
| Moonfen | exotic | arcana | wisp | 3 / 16 | ripple |
| Skyshard Archipelago | exotic | levitation | cloudray | 3 / 19 | spring |
| Morphgrove | exotic | transformation | mimiclizard | 3 / 22 | morph |
| Veil Hollow | exotic | invisibility | shroudmoth | 4 / 26 | mist |
| Ghostglass Reef | exotic | phasing | axolotl | 4 / 30 | phase |
| Chronoglass Wastes | exotic | temporal | scarab | 4 / 36 | time |

Only Whisperwood is initially available. All other entries require the listed
rank and sale milestones; old saves retain passages they previously had. A
Traveller Coin replaces the biome instance seed, finite resource roster, terrain
and wildlife positions. Its saved captured IDs prevent wildlife respawning on
reload. Resource event IDs make seed rolls deterministic and one-use. Stored
items, crops, trials, recipes, native pens and bottles are independent of biome
instances. Recharge is capped at three coins with a 25-minute interval and
rollback/non-finite-time guards.

## Personal garden

The first harvest opens three beds and gives a compatible Silverleaf seed.
Seed identity includes its exact ordinary/Arcane material ID. Soil, fungal,
mineral, exotic and Arcane facilities have progression and purchase costs.
Capacity increases with rank, up to eighteen plots. Growth is settled lazily in
closed form from persistent game time and moisture checkpoints; offline time
is capped at eight hours. Water speeds botanical crops; minerals do not drink.
A mature crop yields 50 ml, consumes its plant and rolls a bounded seed chance
at half the wild probability. Storage must have room before any harvest commits.
Only the first Common Silverleaf tutorial crop receives accelerated growth;
replaying the tour cannot accelerate rare crops or farm demonstration grants.

## Asset contract

Twelve transparent RGBA PNG atlas pairs live in assets/ingredients/biomes/.
The manifest covers 2124 frames: icon, seed/propagation, sprout, young,
developing and mature for every ordinary and Arcane material. Each native frame
is 64×64 with four pixels of separation padding. Metadata includes asset and
species IDs, rarity, Arcane status, biome, atlas filename, frame rectangle, pivot,
native resolution, shape and growth stage. Art/ingredients holds editable
palette/RLE master rasters, not runtime generation recipes. The exporter retains
edits by default; --reauthor deliberately rebuilds initial geometry.

The runtime lazily loads required biome PNGs (including owned seeds and saved
discoveries with empty stock), validates and decodes once, then
uses cached frames for inventory, garden, wilds and fragments. Physical shards
sample the icon master with nearest sampling; pouring does not regenerate a
texture. Studio uses the same registry, can inspect metadata/growth frames and
explicitly bind edited component art. Terrain, materials, light and decorative
physics remain procedural and shared with the Studio. Legacy unregistered
items and dynamic animal remains retain their historical rendering path.

Lazy loading here controls runtime fetch/decode and retained image data. The
production PWA additionally precaches the complete compressed asset bundle so
new biomes and the unrestricted sandbox can still open after a first online
installation. The source/development server fetches biome files on demand.

## Orders and scheduling

Immediate service patience starts at 10 minutes, with personality, complexity
and rank allowances (bounded 5–25 min). Only active visible play advances it;
suspended intervals over one second and modal dialogs do not count. Offers
fall toward 70% of the original budget and the customer leaves at zero.
Negotiation patience remains a separate round-based mechanic.

Adept shops from day three can accept optional commissions generated by the
existing feasibility engine. The displayed reward is 2.5× base budget. Pickup
is in two to five saved game days, with a three-day grace period. Capacity is
rank-dependent and capped at four. Delivery requires one stored complete bottle
meeting every effect, purity and quantity requirement. Validation precedes
consumption; success removes the order and bottle together and pays once.
Declining or missing a commission takes no coins or reputation.

## Save compatibility

v7 archived old physical/material profiles rather than rewriting inventory or
potion contents; previously awakenable legacy matter is explicitly Arcane. v8
added finite biome instances, Traveller Coins and gardens while retaining old
passages. v9 adds commissions and persistent active-play service timers, updates
in-progress tour step order and preserves completed tours. Existing inventory,
recipes, trials, colony identities, stored potions and grown crops remain.
Rolling backups and import/export remain available.

## Permanent ordinary species catalog

Every row also has an Arcane counterpart using the same rarity and composition.
See the machine-readable per-biome atlas metadata for exact frames and source
material IDs; effects are generated from these permanent keys.

| Species | ID | Biome | Rarity | Dominant effect | Structure |
| --- | --- | --- | --- | --- | --- |
| Ironroot | ironroot | forest | common | strength | root |
| Silverleaf | silverleaf | forest | common | vitality | leaf |
| Nightshade | nightshade | forest | common | toxicity | leaf |
| Emberbark | emberbark | forest | common | fire | bark |
| Owlberry | owlberry | forest | common | love | berry |
| Witch’s Ear | witchear | netherwood | common | arcana | bracket |
| Mandrake | mandrake | netherwood | uncommon | swiftness | root |
| Heartpetal | heartpetal | meadow | common | love | petal |
| Sunthistle | sunthistle | meadow | common | fire | flower |
| Nettle | nettle | meadow | common | strength | sprig |
| Dreamclover | dreamclover | meadow | uncommon | arcana | clover |
| Bee Balm | beebalm | meadow | common | vitality | spike |
| Hemlock Seed | hemlock | meadow | common | death | seed |
| River Chalk | riverchalk | river | common | acidity | stone |
| Frostcap | frostcap | river | common | frost | cap |
| Bogbean | bogbean | river | common | vitality | bean |
| Willow Bark | willowbark | river | common | frost | bark |
| Reedmace | reedmace | river | common | strength | reed |
| River Pearl | riverpearl | river | common | arcana | shell |
| Ember Flint | emberflint | quarry | common | fire | stone |
| Mica Dust | mica | quarry | common | swiftness | powder |
| Saltpetre | saltpetre | quarry | common | frost | crust |
| Sulphur Crust | sulfur | quarry | common | acidity | powder |
| Lodestone | lodestone | quarry | common | strength | nugget |
| Cinnabar | cinnabar | quarry | common | swiftness | crystal |
| Storm Glass | stormglass | quarry | uncommon | arcana | shard |
| Grave Moss | gravemoss | moonfen | common | death | moss |
| Star Quartz | starquartz | moonfen | common | arcana | crystal |
| Wisp Lichen | wisplichen | moonfen | common | arcana | moss |
| Moonlily | moonlily | moonfen | common | vitality | lily |
| Toadstool | toadstool | moonfen | common | transformation | toadstool |
| Siren Reed | sirenreed | moonfen | common | love | reed |
| Dragon Pepper | dragonpepper | crags | common | fire | pepper |
| Cinder Scale | cinderscale | crags | uncommon | fire | scale |
| Ashbloom | ashbloom | crags | common | vitality | lily |
| Obsidian | obsidian | crags | common | strength | shard |
| Glimmerdrop | glimmerdrop | river | uncommon | frost | icicle |
| Rosebell | rosebell | netherwood | uncommon | love | bellbloom |
| Dewglobe | dewglobe | netherwood | uncommon | vitality | orb |
| Embertear | embertear | netherwood | uncommon | fire | teardrop |
| Duskbell | duskbell | moonfen | uncommon | arcana | bluebell |
| Bloodnet | bloodnet | netherwood | uncommon | strength | netpod |
| Drift Jelly | driftjelly | moonfen | uncommon | transformation | jelly |
| Pearlpuff | pearlpuff | meadow | uncommon | vitality | puffbloom |
| Streamorb | streamorb | river | uncommon | vitality | orb |
| Pond Jelly | pondjelly | river | uncommon | swiftness | jelly |
| Sunbell | sunbell | meadow | uncommon | fire | bellbloom |
| Honeydrop | honeydrop | meadow | uncommon | love | teardrop |
| Dawnshard | dawnshard | meadow | uncommon | arcana | icicle |
| Moonpuff | moonpuff | moonfen | uncommon | arcana | puffbloom |
| Wispnet | wispnet | moonfen | uncommon | transformation | netpod |
| Umber Crystal | umbercrystal | netherwood | uncommon | arcana | icicle |
| Ember Apple | emberapple | forest | common | fire | apple |
| Gold Pear | goldpear | forest | common | vitality | pear |
| Dusk Plum | duskplum | forest | common | strength | plum |
| Honey Apple | honeyapple | meadow | uncommon | love | apple |
| Gloom Pear | gloompear | netherwood | uncommon | arcana | pear |
| Ghost Plum | ghostplum | netherwood | uncommon | swiftness | plum |
| Honeycup Mushroom | honeycup-mushroom | forest | common | swiftness | mushroom |
| Dawnblossom | dawnblossom | forest | uncommon | vitality | flower |
| Dewpear | dewpear | forest | uncommon | vitality | pear |
| Heartwood Mandrake | heartwood-mandrake | forest | rare | vitality | root |
| Sylvashard Bark | sylvashard-bark | forest | rare | vitality | bark |
| Crown of the Grove | crown-of-the-grove | forest | unique | vitality | fern |
| Elderheart Truffle | elderheart-truffle | forest | unique | vitality | truffle |
| Worldroot Heart | worldroot-heart | forest | legendary | vitality | root |
| Evergreen Chalice | evergreen-chalice | forest | legendary | vitality | clover |
| Meadow Daisy | meadow-daisy | meadow | common | love | flower |
| Sungrass | sungrass | meadow | common | love | sprig |
| Brightberry | brightberry | meadow | uncommon | love | berry |
| Honeyclover | honeyclover | meadow | uncommon | love | clover |
| Suncrown Flower | suncrown-flower | meadow | rare | love | flower |
| Meadowcrystal | meadowcrystal | meadow | rare | love | crystal |
| Rainbow Petal | rainbow-petal | meadow | unique | love | petal |
| Queenbee Orchid | queenbee-orchid | meadow | unique | love | bluebell |
| Aurelian Sunwheel | aurelian-sunwheel | meadow | legendary | love | spike |
| Everlasting Heartrose | everlasting-heartrose | meadow | legendary | love | flower |
| Willowleaf | willowleaf | river | common | frost | leaf |
| Reedcap Mushroom | reedcap-mushroom | river | common | frost | mushroom |
| Riverlotus | riverlotus | river | uncommon | frost | flower |
| Bubbleberry | bubbleberry | river | uncommon | frost | orb |
| Tidebloom | tidebloom | river | rare | frost | flower |
| Streampearl Oyster | streampearl-oyster | river | rare | frost | shell |
| Glacial Waterlily | glacial-waterlily | river | unique | frost | petal |
| Winterglass Reed | winterglass-reed | river | unique | frost | reed |
| Stillwater Crown | stillwater-crown | river | legendary | frost | crystal |
| Pearl of Deepwinter | pearl-of-deepwinter | river | legendary | frost | shell |
| Stonewort | stonewort | quarry | common | strength | sprig |
| Quarrycap | quarrycap | quarry | common | acidity | mushroom |
| Ironbloom | ironbloom | quarry | uncommon | strength | spike |
| Stoneberry | stoneberry | quarry | uncommon | strength | berry |
| Orebud | orebud | quarry | rare | strength | nugget |
| Ferric Crystal | ferric-crystal | quarry | rare | strength | crystal |
| Titan Truffle | titan-truffle | quarry | unique | strength | truffle |
| Adamant Rosette | adamant-rosette | quarry | unique | strength | shard |
| Mountainheart Geode | mountainheart-geode | quarry | legendary | strength | stone |
| Atlas Root | atlas-root | quarry | legendary | strength | root |
| Nethercap Mushroom | nethercap-mushroom | netherwood | common | toxicity | mushroom |
| Gloommoss | gloommoss | netherwood | common | death | moss |
| Umbrabloom | umbrabloom | netherwood | uncommon | toxicity | bluebell |
| Shadefruit | shadefruit | netherwood | uncommon | toxicity | plum |
| Sporelantern | sporelantern | netherwood | rare | toxicity | bellbloom |
| Wraithvine | wraithvine | netherwood | rare | toxicity | netpod |
| Nightbloom Core | nightbloom-core | netherwood | unique | toxicity | orb |
| Widowglass | widowglass | netherwood | unique | toxicity | crystal |
| Black Mycelial Crown | black-mycelial-crown | netherwood | legendary | toxicity | bracket |
| Venom Queen Orchid | venom-queen-orchid | netherwood | legendary | toxicity | flower |
| Emberleaf | emberleaf | crags | common | fire | leaf |
| Cindershroom | cindershroom | crags | common | fire | mushroom |
| Fireberry | fireberry | crags | uncommon | fire | berry |
| Sulfurvine | sulfurvine | crags | uncommon | fire | teardrop |
| Flamecrest | flamecrest | crags | rare | fire | flower |
| Blazestone Crystal | blazestone-crystal | crags | rare | fire | crystal |
| Phoenix Heartseed | phoenix-heartseed | crags | unique | fire | seed |
| Cinderheart Cactus | cinderheart-cactus | crags | unique | fire | spike |
| Everburning Sunheart | everburning-sunheart | crags | legendary | fire | orb |
| Dragon Kilnstone | dragon-kilnstone | crags | legendary | fire | stone |
| Moonreed | moonreed | moonfen | common | arcana | reed |
| Fenmilk Mushroom | fenmilk-mushroom | moonfen | common | arcana | mushroom |
| Luneblue | luneblue | moonfen | uncommon | arcana | flower |
| Dreamberry | dreamberry | moonfen | uncommon | arcana | berry |
| Moonveil Bloom | moonveil-bloom | moonfen | rare | arcana | petal |
| Sleepglass Shard | sleepglass-shard | moonfen | rare | arcana | shard |
| Astral Lotus | astral-lotus | moonfen | unique | arcana | flower |
| Oracle Shell | oracle-shell | moonfen | unique | arcana | shell |
| Celestial Mindseed | celestial-mindseed | moonfen | legendary | arcana | seed |
| Night Sovereign | night-sovereign | moonfen | legendary | arcana | fern |
| Skyspray | skyspray | skyshard | common | levitation | sprig |
| Cloudcap Mushroom | cloudcap-mushroom | skyshard | common | levitation | mushroom |
| Airstar | airstar | skyshard | uncommon | levitation | flower |
| Skyberry | skyberry | skyshard | uncommon | levitation | berry |
| Updraft Seedpod | updraft-seedpod | skyshard | rare | levitation | seed |
| Skyshard Bloom | skyshard-bloom | skyshard | rare | levitation | crystal |
| Nimbus Orchid | nimbus-orchid | skyshard | unique | levitation | bluebell |
| Weightless Geode | weightless-geode | skyshard | unique | levitation | stone |
| Heavensail Fern | heavensail-fern | skyshard | legendary | levitation | fern |
| Zenith Prism | zenith-prism | skyshard | legendary | levitation | shard |
| Morphleaf | morphleaf | morphgrove | common | transformation | leaf |
| Shapecup Mushroom | shapecup-mushroom | morphgrove | common | transformation | mushroom |
| Twinsprout | twinsprout | morphgrove | uncommon | transformation | sprig |
| Graftberry | graftberry | morphgrove | uncommon | transformation | berry |
| Formblossom | formblossom | morphgrove | rare | transformation | flower |
| Adaptive Core | adaptive-core | morphgrove | rare | transformation | orb |
| Chameleon Crown | chameleon-crown | morphgrove | unique | transformation | fern |
| Polyhedral Root | polyhedral-root | morphgrove | unique | transformation | root |
| Genesis Seed | genesis-seed | morphgrove | legendary | transformation | seed |
| Thousandform Lotus | thousandform-lotus | morphgrove | legendary | transformation | petal |
| Veilfern | veilfern | veil | common | invisibility | fern |
| Hollowcap Mushroom | hollowcap-mushroom | veil | common | invisibility | mushroom |
| Phasingbud | phasingbud | veil | uncommon | invisibility | spike |
| Veilberry | veilberry | veil | uncommon | invisibility | berry |
| Hollowbloom | hollowbloom | veil | rare | invisibility | flower |
| Veilglass Crystal | veilglass-crystal | veil | rare | invisibility | crystal |
| Shroud Orchid | shroud-orchid | veil | unique | invisibility | bluebell |
| Unseen Truffle | unseen-truffle | veil | unique | invisibility | truffle |
| Eclipse Heart | eclipse-heart | veil | legendary | invisibility | orb |
| Absent Crown | absent-crown | veil | legendary | invisibility | moss |
| Reefmoss | reefmoss | ghostglass | common | phasing | moss |
| Glasscap Mushroom | glasscap-mushroom | ghostglass | common | phasing | mushroom |
| Coralberry | coralberry | ghostglass | uncommon | phasing | berry |
| Shellfruit | shellfruit | ghostglass | uncommon | phasing | teardrop |
| Ghostglass Coral | ghostglass-coral | ghostglass | rare | phasing | crystal |
| Pearlshell Oyster | pearlshell-oyster | ghostglass | rare | phasing | shell |
| Threshold Anemone | threshold-anemone | ghostglass | unique | phasing | flower |
| Spectral Spine | spectral-spine | ghostglass | unique | phasing | shard |
| Betweenworld Pearl | betweenworld-pearl | ghostglass | legendary | phasing | orb |
| Ghost Sovereign Coral | ghost-sovereign-coral | ghostglass | legendary | phasing | spike |
| Timeweed | timeweed | chronoglass | common | temporal | sprig |
| Sandshirt Mushroom | sandshirt-mushroom | chronoglass | common | temporal | mushroom |
| Hourberry | hourberry | chronoglass | uncommon | temporal | berry |
| Chronovine | chronovine | chronoglass | uncommon | temporal | bellbloom |
| Epochbloom | epochbloom | chronoglass | rare | temporal | flower |
| Chronoglass Shard | chronoglass-shard | chronoglass | rare | temporal | shard |
| Pendulum Root | pendulum-root | chronoglass | unique | temporal | root |
| Sundial Geode | sundial-geode | chronoglass | unique | temporal | stone |
| Paradox Crown | paradox-crown | chronoglass | legendary | temporal | fern |
| Eternal Hourglass | eternal-hourglass | chronoglass | legendary | temporal | crystal |
