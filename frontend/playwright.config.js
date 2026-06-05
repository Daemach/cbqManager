import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Load the project .env so specs can use the real dev-fixture creds (PUSHER_*, FTDI_QUEUE_*).
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

// Capture flag: set PW_CAPTURE=1 (yarn test:e2e:capture) to save a VIDEO + full TRACE
// (console + network logs) for EVERY test under frontend/test-results/. Default keeps them
// only for failures.
const CAPTURE = process.env.PW_CAPTURE === '1' || process.env.PW_CAPTURE === 'true'

// E2E config for the cbqManager SPA. Targets the running Vite dev server (HMR) which proxies
// /api to the ColdBox server. NOTE: the ColdBox server (box server start) must be running too.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // cbqManager's own store is SQLite (single writer). Specs that create/delete Connections in
  // parallel hit SQLITE_BUSY, so run one worker — the suite is small and stays deterministic.
  // (Follow-up: a busy_timeout/WAL on the own-store datasource would let this go parallel again.)
  fullyParallel: false,
  workers: 1,
  reporter: [
    [ 'list' ],
    [ 'junit', { outputFile: '../tests/results/playwright-junit.xml' } ],
    [ 'html', { open: 'never', outputFolder: 'playwright-report' } ]
  ],
  use: {
    baseURL: 'http://localhost:9000',
    headless: true,
    video: CAPTURE ? 'on' : 'retain-on-failure',
    trace: CAPTURE ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [ { name: 'chromium', use: { ...devices[ 'Desktop Chrome' ] } } ],
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:9000',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
