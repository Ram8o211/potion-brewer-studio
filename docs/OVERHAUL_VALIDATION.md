# Overhaul validation record

Work started from `180c7dc351024a88309a66433c17005941a88e15` on `main`.
The implementation is on `feat/complete-potion-brewer-overhaul`, version 2.4.0.
No default-branch merge, deployment or store publication is part of this work.

## Checks

* `npm run check`: type checking, **276 tests across 33 Node files**, zero
  failures/skips, and the 2.4.0 production build passed on the final source.
  The final Node run took 185.8 s. The two desktop/phone saved-discovery
  reload/shop checks also passed in 37.6 s.
* Browser coverage: **168 current cases accounted for, 166 passed, two skipped,
  zero remaining failures or unrun cases**. See
  [the case-by-case record](overhaul-browser-validation.json).
* Both complete first-play tours passed without skipping action steps: actual
  first harvest/seed, friendly native fox, planting/watering, physical Arcane
  awakening, practice-batch disposal, tonic brewing, trial, bottling and sale.
  The closing notes and safe informational replay are covered too.
* `npm run assets:export` reproduced the editable masters, biome PNG/JSON files
  and manifest with zero diff. `npm run assets:validate` passed all four tests,
  including loaded-PNG/custom-Studio precedence and exact fragment restoration.
* The production-cache regression passed: unchanged builds keep the same
  version; an atlas-metadata-only edit changes the offline cache version.

| Chromium profile | Passed | Skipped |
| --- | ---: | ---: |
| Desktop 1440×900 | 67 | 1 |
| Phone portrait 390×844 @2x | 67 | 1 |
| Phone landscape 844×390 @2x | 20 | 0 |
| Tablet 820×1180 @2x | 5 | 0 |
| Offline production | 2 | 0 |
| GitHub Pages-style project subpath | 5 | 0 |

This is incremental validation, not a claim that the initial matrix was clean.
The first full attempt stopped after 107 passes and ten failures. A serial
completion run covered all 57 remaining/failed/skipped cases (53 passed, two
failed, two skipped); the final nine-case run passed every case after the
corrections, followed by two-case runs for saved discoveries, all six Exotic
touch controls/continuous fog and screen disposal. The JSON preserves these run
statistics and the latest result for each current test identity.

Corrections include real Studio gesture coordinates and custom-fragment source
priority, immediate advice refresh, eligible supplies for a forced advanced
order, current biome-instance seeds and explicit biome selection. The first
brewing fixture now uses a fixed seed and stirs the liquid after extraction;
its numerical reading, dose, sale-quality and recipe assertions are retained.
The two mineral cases deliberately skip because this fixed world has no
suitable crystal; they are not counted as passes. Native mineral geometry and
asset coverage remain covered by the Node suites.

The lifecycle regression makes three actual menu/shop round trips, forces
garbage collection and queries live `LabScreen` instances through Chromium's
DevTools protocol. Exactly one screen remains on both desktop and phone, with
normal Playwright tracing enabled. The fix disposes canvas observers and
cancels Wilds prewarming timers/idle callbacks when the screen closes.

Offline checks stop the HTTP server before reload/play. They also cover the
bundled Studio worker, separate source/production caches, stale-tab save
protection and an update served with Pages-style HTTP caching. Phone profiles
are emulated Chromium with touch/DPR settings, not physical devices. Earlier
restricted-sandbox runs reported file-level counts; the final 276 count is the
complete Node test count with local subprocess permission for the build test.

## Asset and deterministic-system evidence

The library contains 177 ordinary species and 177 Arcane counterparts. Each has
an icon, propagation sprite, sprout, young, developing and mature sprite:
2,124 native 64×64 RGBA frames across twelve biome PNG sheets. Automated checks
cover valid PNG dimensions, frame bounds/non-overlap, alpha backgrounds, stage
differences, complete identity coverage and shared inventory/fragment sampling.

`overhaul-rarity-statistics.json` records 4,000 seeded six-draw generations.
Rare species occur in 1,037 generations (25.93%, theoretical 26.49%), Unique in
201 (5.03%, theoretical 5.28%) and Legendary in 18 (0.45%, theoretical 0.60%).
These are **presence probabilities per generation**, not per-draw weights.
Sampling no longer forces rare tiers by exhausting a small species pool.

`overhaul-effect-interactions.json` contains actual before/after effect vectors
for Tailwind, Deep Veil and Temporal Anchor. The foundation regression verifies
their intended channel changes without introducing unrelated effects.

The [screenshot index](screenshots/overhaul-v2/README.md) explains all twelve
biomes, ordinary/Arcane rarity gallery, garden stage fixtures and a recorded
before/after regeneration. These captures were visually inspected.

## Performance method

`perf-overhaul-before.json` preserves the same-session Node baseline measured
before source changes, using `npm run bench -- --physics` on the same machine.
The old benchmark writer merged earlier browser results into that file; those
unmeasured browser fields are deliberately excluded from this baseline.
The final benchmark uses the repository's physics scenarios, real Chromium
frame instrumentation, 4× CPU-throttled phone emulation and a memory soak.
The complete physics/systems/frame run preceded the final fog and screen-exit
fixes; a separate memory-only follow-up measured the corrected final build.
`perf-results.json` records these pass dates explicitly.

| Node scenario | Before ms/step | After ms/step |
| --- | ---: | ---: |
| Pot, 60 particles | 0.473 | 0.154 |
| Pot, 150 particles | 1.024 | 0.373 |
| Pot, full 300-particle target | 1.296 | 0.759 |
| Stirred infusion, 200 particles | 2.697 | 0.511 |
| Arcane conversion, 150 particles | 0.693 | 0.815 |

These are single-run measurements, subject to JIT/load variability. The physics
solver was retained; the lower values cannot all be attributed to this change.
Arcane conversion was 0.122 ms/step slower, while the same 73 particle volumes
awakened at 8.9 simulated seconds. All fifteen physics scenarios and colony
save/load measurements are preserved in
[the comparison](perf-overhaul-comparison.json).

| Software-rendered browser, auto quality | 60 particles FPS | 150 FPS | 300 FPS | 600 FPS |
| --- | ---: | ---: | ---: | ---: |
| Desktop 1440×900 | 19.3 | 50.0 | 38.2 | 34.0 |
| Phone 390×844 @2x, 4× CPU throttle | 17.5 | 16.8 | 10.4 | 6.7 |

At 300 particles, forced phone quality measured 7.1 FPS high, 25.0 medium and
14.7 low; these individual runs do not establish a monotonic quality ranking.
The ten-animal hutch measured 12.0 FPS desktop and 2.9 FPS throttled phone.
No same-session browser baseline was measured. **The 60 FPS/mobile performance
target is not demonstrated by this cloud environment.** Physical-device
profiling remains required before a production performance claim.

The final 450-particle boil/stir soak used 9.43 MB of collected JS heap initially,
then 10.79/10.82/10.76 MB at 30/60/90 seconds. Menu trips previously grew from
11.51 to 22.97 MB between trips one and ten; after disposing observers and
prewarming callbacks, they measured 10.59 to 12.42 MB. The retained increase fell
from 11.46 to 1.83 MB, and the strict lifecycle test confirms one reachable shop
screen. This bounded soak does not prove indefinite memory stability.

The short [Wilds CPU profile](perf-overhaul-ui-profile.json), reproducible
through the evidence script, identified texture upload and scenery animation;
ingredient texture generation is not a runtime hot path for the new catalog.
Particle physics remains enabled. Terrain/light layers and image frames are
cached; atmospheric particles and touch physics are bounded.

## Web artifact integrity

`release/alchemists-shop-2.4.0-web.zip` contains all 40 production files below
`alchemists-shop/`, checked byte-for-byte against `dist/`; ZIP integrity passes.
The archive is 2,076,714 bytes with SHA-256
`4969540117bd57c527b59de07fad2402fc17810c1ed5d60d6af36856998736e0`.
[The release manifest](overhaul-release.json) records every file's size/hash and
build `2.4.0-4da271b436`. The previous 2.3.0 release archive is unchanged.

## Compatibility and remaining release gates

v9 preserves inventory, recipes, embedded world laws, colony, trials, crops and
stored bottles. Unfinished old tours restart in the new step order without
repeated resource grants. Historical awakenable materials remain explicitly
Arcane legacy profiles rather than being silently rewritten. Existing saved
biome rosters are retained; revised generation applies to new instances.

The native PNG library and runtime environment improvements are usable shipped
content. Matching the reference sheets' final commercial art polish still needs
human art acceptance. Automated asset completeness does not certify art quality.
Physical Android sustained performance, heat/battery/background recovery and a
complete first-tour playthrough remain device release gates. The 60 FPS target
must be measured on capable hardware, not inferred from Linux software rendering.

Electron/Tauri and Capacitor have been evaluated in `RELEASE_READINESS.md`.
Native shells, signing, durable native storage, device/store testing and store
approval remain future platform work. The deliverable here is the runnable
Web/PWA build and portable web ZIP.

Remote publication is pending explicit user authorization after an automatic
approval-review rejection of `git push`. The complete branch and commits remain
local; no PR link or remote CI result is claimed.
