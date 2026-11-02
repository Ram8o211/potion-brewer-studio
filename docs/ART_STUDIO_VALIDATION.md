# Art Studio validation — 2026-11-02

Branch: `feature/complete-procedural-art-studio`. This report validates the first component/pixel authoring tranche and ingredient-palette runtime bridge, not the complete master task. Refer to [delivery limits and continuation instructions](ART_STUDIO.md#remaining-implementation-not-delivered).

- `npm run typecheck`: passed after explicit tuple/return annotations for pre-existing animal fixtures. No assertions were removed or weakened.
- `npm test`: **228 passed**, zero failed/skipped (142.8 s on the final run). Focused rerun of Studio and affected animal fixture suites: **31 passed**. The Studio's nine pure-engine tests cover validation, graph construction, deterministic seeds, anchors/growth/locks, weighted choice/exclusion/budgets, correction scopes, alpha/erase, transforms/history, runtime invariants and PNG header bounds.
- `npm run build`: passed; 135 modules bundled through the existing build script. No new dependencies. The editor adds approximately 22 KB gzip to the JavaScript bundle in this build.
- Focused Studio Playwright: **8 passed** across desktop and phone-portrait emulation. Real pointer gestures exercise drawing, selection/extraction, attachment controls, undo/redo, stage/seed editing, file downloads/uploads, IndexedDB recovery, temporary preview and persisted apply/revert, zoom coordinates, gesture cancellation and remembered panel visibility.
- Production offline Playwright: **2 passed**, including a new bundled-Studio test with the HTTP server stopped during drawing and project save/reopen. This also checks that no gameplay save was created.
- `PW_CHROMIUM=/usr/bin/chromium npm run bench`: passed, including 365 colony days, 730 doses, physics, desktop/mobile frame timing and a 90-second memory soak plus ten menu/shop round trips. Fixed the benchmark's stale living-subject list: one dose can kill a rabbit, so the next dose must select from the updated living population. This is a benchmark change, not a simulation change.
- `node scripts/studio-bench.mjs`: 124 instances, 100 measured generations; median **4.984 ms**, p95 **23.277 ms** on this shared executor. Browser regeneration + viewport drawing for the same 124-instance construction, 30 measured samples: desktop **3.3 / 22.5 ms** median/p95; phone emulation with 4× CPU throttle **11.5 / 48.1 ms**. See [structured measurements](art-studio-performance.json).

**Full browser coverage: 132 collected cases, 130 passed, 2 failed, 0 unrun**, combining the interrupted full run, focused final additions and the 18-case resumed run. This is not reported as one uninterrupted green run. See the [per-case result record](art-studio-browser-results.json). One existing desktop integration case (`a day dawns closed; the order card says what it takes and where to find it`) expects `.tech-card` with “Strong and compact” and fails because that element is absent. A targeted run against the untouched onboarding copy reproduced the same assertion failure, with the same seed and viewport. This is a confirmed baseline failure; its assertion is retained.

Performance measurements were taken with other regression processes on the shared executor, using software rendering. Existing game benchmarks ranged from roughly 33–53 fps on desktop, and about 7–24 fps for the throttled phone scenarios; the ten-rabbit hutch was about 7–8 fps. These measurements do **not** establish smooth gameplay on physical phones or prove a performance improvement. They are recorded as limitations, not hidden by changing assertions or throttling settings.

## Reproduction

Use Node >=20, `npm ci`, and the pinned Playwright browser, or the existing repository-supported `PW_CHROMIUM=/usr/bin/chromium` override. The normal dev command is `npm run dev`. Full browser results, screenshots and retained traces are generated under ignored `test-results/`. The focused Studio and bundled offline checks can be run independently:

```sh
PW_CHROMIUM=/usr/bin/chromium npm run test:browser -- tests/browser/art-studio.spec.mjs
PW_CHROMIUM=/usr/bin/chromium npm run test:browser -- tests/browser/offline.spec.mjs --project=offline-build
node --test tests/studio.test.mjs
node scripts/studio-bench.mjs
```

The original onboarding copy at `/workspace/potion-validation` was used only for read-only baseline comparison (a local runner configuration starts it on port 5183). No previous experimental editor was read or copied.

## Interrupted run and recovery

The initial full `npm run test:browser` run collected 129 cases and recorded 110 outcomes (108 passed, 2 failed) before an environment restart terminated its processes. The filesystem, commits and logs survived. Playwright's `--list --reporter=json` was used to compare the current 132-case collection with completed outcomes from that run and the focused Studio/offline runs. The 18 remaining cases were selected with the supported `--test-list` option and **18 passed** (3.2 minutes). The final nine pure Studio tests and the final PNG/layout subset also passed. No zero-test run, interrupted process or collection-only result was counted as a test pass.

The rebuilt `dist/` and `release/alchemists-shop-2.3.0-web.zip` are included on this branch. The archive CRCs were checked and its bundled JavaScript matches `dist/` byte for byte. The build removes stale prebuilt hutch PNG files absent from source assets; current source renderers use procedural pens and do not reference those files. The final bundled Studio offline test passed after the last build.
