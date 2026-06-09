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
  // Worker cap (issue #24). PRIMARY fix: log in ONCE in globalSetup and share an authenticated
  // storageState across every worker (below) so NO spec hits /api/login per-test — that removed the
  // parallel-login contention on the JWT/CacheBox auth path. But a second, deeper bottleneck remains
  // that storageState alone cannot solve: the data specs create Connections pointing at a real MSSQL
  // host, and the backend's JDBC SSL handshake to that host fails SLOWLY (PKIX cert path, multi-second
  // hang per attempt). Run ~4+ of those concurrently and the BoxLang request-thread pool saturates;
  // the server then returns 503/500 to everything (logins included) and stays wedged for minutes.
  // That is a backend-capacity issue, out of scope for this test-infra slice. Per the issue DoD we
  // therefore CAP workers at the value confirmed green (2 — same as the #21 run) while keeping
  // fullyParallel so specs still interleave. Raise this only after the backend handles concurrent
  // unreachable-Connection handshakes without thread-pool starvation. The cap is overridable on the
  // CLI (`--workers=N`).
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
