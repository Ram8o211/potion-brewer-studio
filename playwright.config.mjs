// Browser test suite. Runs against the dev server (source modules) for the
// gameplay/layout specs, against the production build for the offline spec,
// and against the repository served under a GitHub Pages-style sub-path.
// Chromium only; phone layouts are desktop emulation (viewport, touch,
// device pixel ratio), not physical devices.
import { defineConfig } from '@playwright/test';

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'tests/browser',
  // Complete physical brewing and multi-room flows on software-rendered CI.
  timeout: 300_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // a preinstalled Chromium can stand in for the pinned one (PW_CHROMIUM=/path/to/chromium)
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: [
    { command: 'node scripts/serve.mjs --root . --port 5173', url: 'http://localhost:5173/index.html', reuseExistingServer: true },
    { command: 'node scripts/build.mjs --no-zip && node scripts/serve.mjs --root dist --port 4173', url: 'http://localhost:4173/index.html', reuseExistingServer: true, timeout: 60_000 },
    // the repository served the way a GitHub Pages branch deploy serves it
    { command: 'node scripts/serve.mjs --root . --port 4174 --base /Potion-Brewer-Claude-/', url: 'http://localhost:4174/Potion-Brewer-Claude-/index.html', reuseExistingServer: true },
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, testIgnore: /offline|subpath/ },
    { name: 'phone-portrait', use: { ...phone }, testIgnore: /offline|subpath/ },
    { name: 'phone-landscape', use: { ...phone, viewport: { width: 844, height: 390 } }, testMatch: /layout|gameplay|rooms|colony|showcase/ },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, testMatch: /layout/ },
    { name: 'offline-build', use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 800 } }, testMatch: /offline/ },
    { name: 'pages-subpath', use: { baseURL: 'http://localhost:4174/Potion-Brewer-Claude-/', viewport: { width: 1280, height: 800 } }, testMatch: /subpath/ },
  ],
});
