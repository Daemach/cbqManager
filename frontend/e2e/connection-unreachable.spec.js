import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// Issue #21 — the console must stay CALM when a Connection's target DB is unreachable (CONTEXT.md
// "Primary operator workflow": the operator opens the console BEFORE connecting the VPN). The tool
// views must show a friendly, retryable banner — not a raw 500/blank — and Refresh must re-attempt.
//
// We make a THROWAWAY Connection pointing at an unreachable DB (jdbc:sqlserver://localhost;
// databaseName=test, exactly as the other e2e specs do). NOTE: the seeded FTDIQueue (id 7) is a
// REACHABLE dev Connection — we deliberately do NOT use it here.
//
// Trace gate: the backend deliberately returns HTTP 503 connection_unreachable for these loads. That
// 503 is EXPECTED (like the deliberate auth 403s elsewhere) — we assert it IS the connection_unreachable
// path and treat ONLY that as allowed. Any OTHER >=400 response, console error, or page error fails.

async function token(page) {
  return page.evaluate(() => localStorage.getItem('cbqm_token'))
}

async function createUnreachableConn(page, name) {
  const res = await page.request.post('/api/connections', {
    headers: authHeader(await token(page)),
    data: {
      name,
      environment: 'development',
      grammar: 'mssql',
      datasourceClass: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
      connectionString: 'jdbc:sqlserver://localhost;databaseName=test',
      secrets: { username: 'sa', password: 'x' }
    }
  })
  expect(res.ok(), `create connection failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()).data.id
}

async function deleteConn(page, id) {
  await page.request.delete(`/api/connections/${id}`, { headers: authHeader(await token(page)) }).catch(() => {})
}

// Navigate to a tool for a specific Connection AND wait for the app to actually switch context to it
// (the shell auto-opens/restores tabs, so a bare goto can leave a different Connection active). Mirrors
// monitor-dock.spec.js gotoConn — the realtime store's activeId is the source of truth for "am I on it".
async function gotoTool(page, id, tool) {
  await page.goto(`/#/c/${id}/${tool}`)
  await page.waitForFunction(
    (cid) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(cid),
    String(id)
  )
}

// Console/page error collector that TOLERATES the EXPECTED 503 (the browser logs every >=400 fetch
// as a console "Failed to load resource ... 503" — that is the deliberate connection_unreachable
// path here, like the deliberate auth 403s elsewhere). Any OTHER console/page error still fails.
const EXPECTED_503 = /Failed to load resource.*503/i
function collectAppErrors(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !EXPECTED_503.test(msg.text())) errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

// Collect every API response; classify the EXPECTED connection_unreachable 503 vs. unexpected >=400.
function collectResponses(page) {
  const unexpected = []
  let unreachable503 = 0
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.includes('/api/')) return
    const status = res.status()
    if (status < 400) return
    // The expected pre-VPN 503 on the tool endpoints.
    if (status === 503 && /\/connections\/\d+\/(health|jobs|failed-jobs|batches|archive)/.test(url)) {
      unreachable503++
      return
    }
    unexpected.push(`${status} ${res.request().method()} ${url}`)
  })
  return { unexpected, got503: () => unreachable503 }
}

test.describe('Connection unreachable — calm, retryable tool views (pre-VPN)', () => {
  test('a tool view shows the calm retryable banner and Refresh re-attempts', async ({ page }) => {
    // This walks all four tool views (5 context switches, each waiting on a real 503 round-trip); under
    // capture (video+trace) on a contended backend that legitimately needs more than the 30s default.
    test.setTimeout(75_000)
    const errors = collectAppErrors(page)
    const responses = collectResponses(page)

    await loginAndOpenApp(page)
    const id = await createUnreachableConn(page, `e2e-unreach-${Date.now()}`)
    try {
      // Navigate straight to a tool for the unreachable Connection (deep link, as auto-open would) and
      // wait for THIS Connection's health load to come back 503 — that is the view's load firing for the
      // newly-active context (the shell auto-opens FTDIQueue too, so we anchor on our own id's response).
      const firstLoad = page.waitForResponse(
        (r) => r.url().includes(`/connections/${id}/health`) && r.status() === 503,
        { timeout: 15000 }
      )
      await gotoTool(page, id, 'health')
      await firstLoad

      // The calm banner shows (not a 500/blank); the data table is absent.
      const banner = page.locator('[data-test=connection-unreachable]')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('connect the VPN')
      // The tool's own data table is suppressed in favor of the banner (the persistent Live Monitor
      // dock has its own table, so we target the tool table by its data-test, not a bare .q-table).
      await expect(page.locator('[data-test=health-table]')).toHaveCount(0)

      // The expected 503 did fire on the tool endpoint.
      await expect.poll(() => responses.got503(), { message: 'expected a connection_unreachable 503 on the tool load' }).toBeGreaterThan(0)

      // Refresh re-attempts the load (banner persists since the DB is still unreachable). Wait on the
      // re-fired request directly (robust under parallel load) rather than polling a counter.
      const refired = page.waitForResponse(
        (r) => /\/connections\/\d+\/health/.test(r.url()) && r.status() === 503,
        { timeout: 15000 }
      )
      await page.locator('[data-test=connection-unreachable-refresh]').click()
      await refired
      await expect(banner).toBeVisible()

      // The banner is consistent across the other tool views too (shared component). The REAL 503
      // round-trip is already proven on `health` above, so stub the remaining tools' loads to an
      // INSTANT connection_unreachable 503 — this avoids 3 more multi-second handshakes and keeps the
      // suite fast/stable at higher worker counts (#27).
      await page.route(new RegExp(`/api/connections/${id}/(jobs|failed-jobs|batches)`), (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: true, code: 'connection_unreachable', messages: [ 'unreachable' ] }) })
      )
      for (const tool of ['jobs', 'failed', 'batches']) {
        await gotoTool(page, id, tool)
        await expect(page.locator('[data-test=connection-unreachable]')).toBeVisible()
      }

      // Trace gate: no UNEXPECTED >=400 responses, no console/page errors.
      expect(responses.unexpected, `unexpected >=400 responses:\n${responses.unexpected.join('\n')}`).toEqual([])
      expect(errors, `console/page errors:\n${errors.join('\n')}`).toEqual([])
    } finally {
      await deleteConn(page, id)
    }
  })

  test('the Connection picker keeps working regardless of reachability', async ({ page }) => {
    // The banner waits on a real connection_unreachable 503, whose JDBC handshake against an
    // unreachable host is genuinely slow under load — give it room beyond the 10s expect default.
    test.setTimeout(60_000)
    await loginAndOpenApp(page)
    const id = await createUnreachableConn(page, `e2e-unreach-picker-${Date.now()}`)
    try {
      // The toolbar picker reads the OWN store (not the target DB), so it must always render.
      await gotoTool(page, id, 'health')
      await expect(page.locator('[data-test=connection-picker]')).toBeVisible()
      await expect(page.locator('[data-test=connection-unreachable]')).toBeVisible({ timeout: 30_000 })
    } finally {
      await deleteConn(page, id)
    }
  })
})
