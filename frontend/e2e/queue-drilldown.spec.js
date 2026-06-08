import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// Slice 3 (#11): drilling into a Queue in a tool auto-applies a clearable queue= filter on the Live
// Monitor dock for the active context. We stub the Queue Health endpoint so the tool table is
// deterministic (the e2e Connections point at an unreachable DB), then click the REAL Watch button
// and assert the dock chip + narrowed feed + one-click clear + per-context isolation. Live events are
// injected via the dev seam (window.__cbqmRealtime), as in monitor-dock.spec.js.

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

async function gotoHealth(page, id) {
  await page.goto(`/#/c/${id}/health`)
  await page.waitForFunction(
    (cid) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(cid),
    String(id)
  )
}

// Stub Queue Health so the tool table has clickable rows regardless of DB reachability.
async function stubHealth(page, queues) {
  await page.route('**/api/connections/**/health**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: queues.map((q) => ({
          queue: q, openTotal: 1, orphanedBlockers: 0, pickableFresh: 1,
          pickableReservedTimedout: 0, inFlight: 0, scheduledFuture: 0
        }))
      })
    })
  )
}

async function inject(page, cid, count, queue) {
  await page.evaluate(({ cid, count, queue }) => {
    for (let i = 0; i < count; i++) {
      window.__cbqmRealtime.pushEvent(String(cid), {
        queue, state: 'reserved', mapping: 'DemoJob', instance: 'w1',
        jobId: i + 1, type: 'info', text: `${queue} ${i}`
      })
    }
  }, { cid, count, queue })
}

test.describe('Queue drill-down → Monitor filter', () => {
  test('Watch on a Queue Health row auto-filters the dock; the chip clears in one click', async ({ page }) => {
    await loginAndOpenApp(page)
    await stubHealth(page, ['emails', 'reports'])
    const id = await createConn(page, `e2e-drill-${Date.now()}`)
    try {
      await gotoHealth(page, id)
      // Mixed feed: 2 emails + 3 reports.
      await inject(page, id, 2, 'emails')
      await inject(page, id, 3, 'reports')
      await expect(rows(page)).toHaveCount(5)
      await expect(page.locator('[data-test=monitor-queue-filter]')).toHaveCount(0)

      // Drill down on the emails row.
      await page.locator('[data-test="watch-emails"]').click()
      await expect(page.locator('[data-test=monitor-queue-filter]')).toContainText('queue: emails')
      await expect(rows(page)).toHaveCount(2)
      // The dock's Queue input mirrors the same source of truth.
      await expect(page.locator('[data-test=dock-filter-queue]')).toHaveValue('emails')

      // One-click clear via the chip restores the full feed.
      await page.locator('[data-test=monitor-queue-filter] .q-chip__icon--remove').click()
      await expect(page.locator('[data-test=monitor-queue-filter]')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(5)
    } finally {
      await deleteConn(page, id)
    }
  })

  test('the auto-applied filter is per-context — no bleed across tabs', async ({ page }) => {
    await loginAndOpenApp(page)
    await stubHealth(page, ['emails', 'reports'])
    const a = await createConn(page, `e2e-drill-a-${Date.now()}`)
    const b = await createConn(page, `e2e-drill-b-${Date.now()}`)
    try {
      await gotoHealth(page, a)
      await inject(page, a, 2, 'emails')
      await inject(page, a, 3, 'reports')
      await page.locator('[data-test="watch-emails"]').click()
      await expect(rows(page)).toHaveCount(2)

      // Switch to B: B has its own (unfiltered) feed — A's queue filter must not bleed in.
      await gotoHealth(page, b)
      await inject(page, b, 4, 'reports')
      await expect(page.locator('[data-test=monitor-queue-filter]')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(4)

      // Back to A: the emails filter is preserved.
      await gotoHealth(page, a)
      await expect(page.locator('[data-test=monitor-queue-filter]')).toContainText('queue: emails')
      await expect(rows(page)).toHaveCount(2)
    } finally {
      await deleteConn(page, a)
      await deleteConn(page, b)
    }
  })
})
