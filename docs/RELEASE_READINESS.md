# Web, Steam and Google Play release preparation

## Architecture decision

Keep the current JavaScript engine and Canvas2D renderer. The static production
bundle supports HTTP hosting, an offline PWA and a thin platform shell without
rewriting the particle simulation, atlas loader, Studio or save model.

**Web:** `npm run build` creates fingerprinted code/CSS, biome PNG/JSON assets,
a versioned service-worker precache, build metadata and a portable ZIP. Serve
`dist/` over HTTP(S), not `file://`. Source and production service workers use
separate scopes on project-site hosts. Saves have rolling backups and JSON
export/import; browsers can still evict site data, so export remains essential.

**Steam recommendation:** an Electron shell is a straightforward fit for this
Node-built web application. Serve packaged `dist/` on a loopback HTTP origin
inside the shell to preserve fetch, service-worker and save semantics. Use a
persistent application data directory; enable sandbox and context isolation,
disable renderer Node integration, restrict navigation/new windows, bind only
loopback, and validate all paths in any local file server. An optional Steamworks
bridge should expose only narrowly scoped achievements/cloud-save functions.
Tauri is a lower-download-size alternative, but system WebView variation, audio,
Canvas performance and service-worker support need a measured compatibility
spike before adoption. Neither shell has been built or signed in this task.

**Google Play recommendation:** Capacitor with `webDir: 'dist'`, a stable reverse
DNS application ID and local bundled assets. Retain the existing touch controls
and safe-area CSS. Test Android WebView fetch and offline behavior; do not rely
on service workers being the only local-asset path. Use versioned native storage
for durable saves and migrate localStorage once, with an exportable backup.
Enable WebView debugging only in development. Build/sign an Android App Bundle
with a current Play-compliant SDK and the project owner's signing credentials.
No Android SDK/device or signing credentials were provided; no native AAB has
been built, uploaded or represented as store-approved.

## Release gates

- [x] Run final typecheck, 276 Node tests, production build and the browser
  matrix/corrective runs (166 passes, two deliberate seeded-mineral skips).
- [x] Inspect all twelve biomes and representative ordinary/Arcane/growth
  artwork in actual runtime captures; validate all 2,124 frames automatically.
- [x] Complete the contextual first tour on desktop and phone emulation.
- [x] Verify web save/reload, migration, backups/import/export, scoped offline
  startup, stale-tab protection and redeploy behavior with the server stopped.
- [x] Verify delayed commission persistence and one-use delivery across a
  serialized state reload, including invalid/early bottle rejection.
- [ ] Play the entire first-tour loop using touch on a physical Android device.
- [ ] Test low/mid/high Android hardware: sustained frame times, heat, battery,
  background/resume, process termination, rotation and WebView updates.
- [ ] Test desktop keyboard/mouse, DPI scaling, fullscreen, window resizing and
  supported Windows/macOS/Linux versions in the chosen shell.
- [ ] Verify new, migrated, corrupt, backed-up and imported saves; complete a
  delayed commission across a forced application restart.
- [ ] Verify airplane mode, cold start, service-worker updates, stale second
  tabs, source/production scopes and storage quota recovery.
- [ ] Check screen readers, focus order, reduced motion, contrast, touch target
  sizes, safe areas and text legibility at all supported resolutions.
- [ ] Review the art at intended display sizes against the supplied references.
  Native PNG availability alone does not prove final commercial art quality.
- [ ] Confirm asset ownership/licenses, attribution, privacy disclosures, animal
  testing content ratings, store screenshots and localization requirements.
- [ ] Add durable native save storage and test the chosen packaging solution.
- [ ] Sign platform artifacts, scan packaged dependencies and smoke-test clean
  installs/upgrades/uninstalls through official platform testing channels.
- [ ] Complete Steam and Google Play account, review and certification steps.

Checks requiring actual hardware, signed packages or store review remain open.
The available Linux Chromium phone profiles are emulation only. No engine
migration, default-branch merge, website deployment or store publication occurs
as part of this implementation.
