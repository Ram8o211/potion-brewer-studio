# Integrated Art Studio validation

This report covers the completed native-editor integration, version 2 project format and the worker-enabled production package. The [first-tranche report](ART_STUDIO_V1_VALIDATION.md) is retained as history, not the current readiness result.

| Check | Outcome |
| --- | --- |
| `npm run typecheck` | Passed, including editor modules and existing tests |
| `npm test` | **238 passed**, 0 failed/cancelled/skipped; 135.6 s |
| `npm run build` | Passed; main application + environment worker, versioned precache and ZIP |
| Full `npm run test:browser` | **140 passed**, 0 failed/skipped/flaky; one uninterrupted 25.4-minute run |
| Final focused editor/offline run | **18 passed**, desktop, phone and offline production |
| Native domain unit checks | **9 passed**, including migration, actual graph-backed frames/fragments, terrain masks, anatomy, visual/physical separation, proposal freshness, mounting conventions and localized lights |
| Actual material pixels | Gas tint verified in the FluidRenderer's RGBA output; renderer remains attached after property changes |
| Worker/offline | Environment composition runs through the actual module worker after the HTTP server is stopped; fallback was not counted as worker success |
| Manual functional checks | Native growth playback changes stages; a text world seed (`amber-hollow`) reaches the composed scene |
| `npm run bench` | Passed: physics, 365 colony days / 730 doses, browser profiles, 90-second memory soak, ten menu/shop round trips |
| Release archive | CRCs pass; every ZIP entry matches `dist/`, including `studio-worker.js` |

[Per-case browser outcomes](art-studio-browser-results.json) come from the full runner's current JSON report. Focused runs used separate output directories and did not overwrite it. The final focused run follows editor-only worker/lifecycle/world-seed refinements; no interrupted or zero-test execution is reported as passed.

The two original browser failures are resolved. Explicit `techniques` passed to commission generation were being silently discarded when a candidate plan could not support them. The generator now retries the candidate instead, preserving the requested constraint. A new headless regression test and the unchanged desktop/phone browser assertions pass. Normal commission generation without forced techniques is unchanged.

## Coverage

The new browser workflows enter all native editors from the same Studio screen, extract actual ingredient geometry, bind custom graphs to runtime species, paint structural terrain and recover its editable data, edit real creature poses/mutations, change phase-specific material pixels, author native magical particles, apply UI artwork and revert the profile. The earlier tests continue to cover drawing, selection/extraction, correction layers, undo/redo, variants/growth, PNG/project import/export, rejected imports, persistent drafts, temporary in-game previews, legacy save loading and responsive layouts.

The full suite also checks actual gameplay, simulation tools, shelf/bottle/trial persistence, colony behavior, gathering, terrain placement, damaged-save recovery, offline play, shared-origin cache isolation and redeployment under GitHub Pages-style paths. No assertions were removed or skipped to obtain these results.

## Measurements and limits

See [structured Studio measurements](art-studio-performance.json) and [the standard benchmark output](perf-results.json). These were collected on a shared cloud executor with concurrent regression work and software rendering. The game benchmark's desktop cases were approximately 30–46 fps, throttled phone cases approximately 8–22 fps, and the ten-animal hutch approximately 7–9 fps. These are measured limits, not a claim of smooth gameplay on physical phones.

The memory soak measured approximately 7.96 MB initially, 9.51 MB after 90 seconds, and 14.34 MB after ten menu/shop trips. Editor scenes are bounded, component canvases remain 32×32, outputs 96×96, and native regions 384×216. Large environment regeneration runs off the UI thread; static scene bitmaps are reused for animation. The optional assistant protocol is implemented, but no external model backend or API secret is included.

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run build
PW_CHROMIUM=/usr/bin/chromium npm run test:browser
PW_CHROMIUM=/usr/bin/chromium npm run bench
node scripts/studio-bench.mjs
```

Use the pinned Playwright browser instead when installed. Detailed usage, schema migration, runtime adapters and supported bounds are in [ART_STUDIO.md](ART_STUDIO.md). Publication of the Git branch and verification of the public Pages deployment are separate from these local checks.
