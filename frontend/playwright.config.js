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
  // All transient test output goes under the repo-root .loop-artifacts/ folder (gitignored) so an
  // unattended build loop never needs to `rm` (which requires approval). The human cleans up
  // .loop-artifacts/ later. See docs/agents/build-loop.md.
  outputDir: '../.loop-artifacts/playwright/test-results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // cbqManager's own store is SQLite (single writer). With WAL + busy_timeout now set on the
  // own-store datasource (Application.bx, issue #12), concurrent Connection writes wait instead of
  // throwing SQLITE_BUSY on a local-disk store, so the suite runs parallel again.
  fullyParallel: true,
  reporter: [
    [ 'list' ],
    [ 'junit', { outputFile: '../.loop-artifacts/playwright/junit.xml' } ],
    [ 'html', { open: 'never', outputFolder: '../.loop-artifacts/playwright/report' } ]
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
