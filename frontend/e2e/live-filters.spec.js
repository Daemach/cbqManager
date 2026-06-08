import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// Issue #19: fast combinable live filters + 'current feed + last N minutes' lookback. We drive the
// real SPA and inject synthetic LiveEvents via the dev seam (window.__cbqmRealtime), exactly like
// monitor-dock.spec.js / queue-drilldown.spec.js. For the lookback assertions we PIN the store clock
// (window.__cbqmRealtime.nowMs) and inject events with an explicit `time`, so the window math is
// deterministic and not subject to Date.now flakiness. Connections have NO Broadcast Connection, so
// navigating never opens a real socket — the store's filter/history logic is what's under test.

const rows = (page) => page.locator('[data-test=monitor-row]')
const token = (page) => page.evaluate(() => localStorage.getItem('cbqm_token'))

async function createConn(page, name) {
  const res = await page.request.post('/api/connections', {
    headers: authHeader(await token(page)),
    data: {
      name, environment: 'development', grammar: 'mssql',
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

async function gotoConn(page, id) {
  await page.goto(`/#/c/${id}/health`)
  await page.waitForFunction(
    (cid) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(cid),
    String(id)
  )
}

// Inject `count` synthetic LiveEvents into a context (live, "now"-timed).
async function inject(page, cid, count, overrides = {}) {
  await page.evaluate(({ cid, count, overrides }) => {
    for (let i = 0; i < count; i++) {
      window.__cbqmRealtime.pushEvent(String(cid), {
        queue: overrides.queue || 'emails',
        state: overrides.state || 'reserved',
        mapping: overrides.mapping || 'DemoJob',
        instance: overrides.instance || 'w1',
        jobId: (overrides.jobId || 1) + i,
        type: overrides.type || 'info',
        text: `${overrides.text || 'event'} ${i}`
      })
    }
  }, { cid, count, overrides })
}

// Pin the store clock to a fixed epoch so lookback windows are deterministic.
async function pinClock(page, nowMs) {
  await page.evaluate((ms) => { window.__cbqmRealtime.nowMs = () => ms }, nowMs)
}

// Inject one event `agoMin` minutes before the pinned clock.
async function injectAt(page, cid, nowMs, agoMin, overrides = {}) {
  await page.evaluate(({ cid, nowMs, agoMin, overrides }) => {
    window.__cbqmRealtime.pushEvent(String(cid), {
      time: new Date(nowMs - agoMin * 60000).toISOString(),
      queue: overrides.queue || 'emails',
      state: overrides.state || 'reserved',
      mapping: overrides.mapping || 'DemoJob',
      instance: overrides.instance || 'w1',
      jobId: overrides.jobId || 1,
      type: overrides.type || 'info',
      text: overrides.text || `t-${agoMin}`
    })
  }, { cid, nowMs, agoMin, overrides })
}

test.describe('Live Monitor — combinable filters + lookback (#19)', () => {
  test('instance badge drills down to a removable, one-click-clearable instance filter', async ({ page }) => {
    await loginAndOpenApp(page)
    const id = await createConn(page, `e2e-inst-${Date.now()}`)
    try {
      await gotoConn(page, id)
      // Mixed feed: 2 from worker-a, 3 from worker-b.
      await inject(page, id, 2, { instance: 'worker-a', text: 'A' })
      await inject(page, id, 3, { instance: 'worker-b', text: 'B' })
      await expect(rows(page)).toHaveCount(5)
      await expect(page.locator('[data-test=monitor-instance-filter]')).toHaveCount(0)

      // Click a worker-a badge → instance chip + narrowed feed.
      await page.locator('[data-test=monitor-instance-badge]', { hasText: 'worker-a' }).first().click()
      await expect(page.locator('[data-test=monitor-instance-filter]')).toContainText('instance: worker-a')
      await expect(rows(page)).toHaveCount(2)
      await expect(page.locator('[data-test=dock-filter-instance]')).toHaveValue('worker-a')

      // One-click clear via the chip restores the full feed.
      await page.locator('[data-test=monitor-instance-filter] .q-chip__icon--remove').click()
      await expect(page.locator('[data-test=monitor-instance-filter]')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(5)
    } finally {
      await deleteConn(page, id)
    }
  })

  test('instance + queue filters combine (ANDed) to isolate a problem fast', async ({ page }) => {
    await loginAndOpenApp(page)
    const id = await createConn(page, `e2e-combine-${Date.now()}`)
    try {
      await gotoConn(page, id)
      await inject(page, id, 2, { instance: 'w1', queue: 'emails', text: 'EW' })
      await inject(page, id, 2, { instance: 'w1', queue: 'imports', text: 'IW' })
      await inject(page, id, 2, { instance: 'w2', queue: 'emails', text: 'EW2' })
      await expect(rows(page)).toHaveCount(6)

      await page.locator('[data-test=dock-filter-instance]').fill('w1')
      await expect(rows(page)).toHaveCount(4)
      await page.locator('[data-test=dock-filter-queue]').fill('emails')
      await expect(rows(page)).toHaveCount(2) // w1 AND emails only
    } finally {
      await deleteConn(page, id)
    }
  })

  test('lookback surfaces an event older than the visible cap, narrows by window', async ({ page }) => {
    await loginAndOpenApp(page)
    const id = await createConn(page, `e2e-lookback-${Date.now()}`)
    const NOW = 1_700_000_000_000
    try {
      await gotoConn(page, id)
      await pinClock(page, NOW)
      // Shrink the visible cap so older events scroll off, but history retains them.
      await page.evaluate(() => { window.__cbqmRealtime.maxEvents = 3 })

      // 2 old events (8 and 12 min ago) + 4 fresh — visible feed keeps only the newest 3.
      await injectAt(page, id, NOW, 12, { text: 'old-12' })
      await injectAt(page, id, NOW, 8, { text: 'old-8' })
      for (let i = 0; i < 4; i++) await injectAt(page, id, NOW, 0.1 * i, { text: `fresh-${i}` })
      await expect(rows(page)).toHaveCount(3) // visible cap

      // Lookback last 10 min → surfaces old-8 (within window) but NOT old-12, plus the 4 fresh = 5.
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: '10m' }).click()
      await expect(rows(page)).toHaveCount(5)
      await expect(page.getByText('old-8')).toBeVisible()
      await expect(page.getByText('old-12')).toHaveCount(0)

      // Widen to 15m → old-12 now appears too (6 total).
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: '15m' }).click()
      await expect(rows(page)).toHaveCount(6)
      await expect(page.getByText('old-12')).toBeVisible()

      // Back to Live → only the visible (capped) feed.
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: 'Live' }).click()
      await expect(rows(page)).toHaveCount(3)
    } finally {
      await deleteConn(page, id)
    }
  })

  test('lookback is per-context — it does not bleed across tabs', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-lb-a-${Date.now()}`)
    const b = await createConn(page, `e2e-lb-b-${Date.now()}`)
    const NOW = 1_700_000_000_000
    try {
      await gotoConn(page, a)
      await pinClock(page, NOW)
      await page.evaluate(() => { window.__cbqmRealtime.maxEvents = 2 })
      // A: an old event past the visible cap, recoverable only via lookback.
      await injectAt(page, a, NOW, 9, { text: 'A-old' })
      await injectAt(page, a, NOW, 0.1, { text: 'A1' })
      await injectAt(page, a, NOW, 0.2, { text: 'A2' })
      await expect(rows(page)).toHaveCount(2)
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: '10m' }).click()
      await expect(rows(page)).toHaveCount(3)
      await expect(page.getByText('A-old')).toBeVisible()

      // Switch to B: its own context starts on Live (no lookback bleed), and shows only B's events.
      await gotoConn(page, b)
      await expect(page.locator('[data-test=dock-lookback]').getByRole('button', { name: 'Live' }))
        .toHaveAttribute('aria-pressed', 'true')
      await injectAt(page, b, NOW, 0.1, { text: 'B1' })
      await expect(rows(page)).toHaveCount(1)
      await expect(page.getByText('A-old')).toHaveCount(0)

      // Back to A: its 10m lookback is preserved.
      await gotoConn(page, a)
      await expect(page.locator('[data-test=dock-lookback]').getByRole('button', { name: '10m' }))
        .toHaveAttribute('aria-pressed', 'true')
      await expect(rows(page)).toHaveCount(3)
      await expect(page.getByText('A-old')).toBeVisible()
    } finally {
      await deleteConn(page, a)
      await deleteConn(page, b)
    }
  })
})
