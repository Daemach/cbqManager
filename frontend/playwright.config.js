import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { STORAGE_STATE_PATH } from './e2e/support/auth-state.js'

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
  // Worker count. Two contention sources once forced a cap of 2: per-spec /api/login (fixed by the
  // shared storageState below, issue #24) and the backend hanging a thread 15-30s per unreachable-
  // Connection JDBC handshake, which OOM'd the server at >=4 workers. Issue #25 fast-failed that
  // connect (~1.5s), and the server now stays up even at 6 workers (the OOM is gone). The remaining
  // limiter is ONE heavy spec — the connection-unreachable walk (5 real 503 round-trips) — which goes
  // flaky above ~2 under capture load; so we keep 2 for a reliable green-gate. Follow-up: lighten that
  // spec (or raise its per-step timeouts) to lift the cap. Overridable via `--workers=N`.
  workers: 2,
  // Log in ONCE before the suite and share an authenticated storageState across every worker, so no
  // spec hits /api/login per-test. The auth-flow specs that need an unauthenticated/!=admin state opt
  // out per-file (frontend/e2e/auth.spec.js: test.use({ storageState: { cookies: [], origins: [] } })).
  globalSetup: './e2e/support/global-setup.js',
  // After the suite, sweep any leaked test Connections (e2e-* / TEST_*) from the own store so a
  // failed spec that skipped its per-test cleanup can't accumulate rows (issue #24).
  globalTeardown: './e2e/support/global-teardown.js',
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
  projects: [
    { name: 'chromium', use: { ...devices[ 'Desktop Chrome' ], storageState: STORAGE_STATE_PATH } }
  ],
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:9000',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
