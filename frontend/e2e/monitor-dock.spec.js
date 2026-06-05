import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// RealtimeStore behavior (PRD-0002 keystone) driven through the running SPA. The live feed is
// injected via a dev-only seam (window.__cbqmRealtime) so the assertions are deterministic and do
// not depend on live Pusher traffic. We use Connections WITHOUT a Broadcast Connection so navigating
// to them never opens a real socket — the store's hoist/persist/swap/pause logic is what's under test.

const rows = (page) => page.locator('[data-test=monitor-row]')

async function token(page) {
  return page.evaluate(() => localStorage.getItem('cbqm_token'))
}

async function createConn(page, name) {
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

async function gotoConn(page, id) {
  await page.goto(`/#/c/${id}/health`)
  await page.waitForFunction(
    (cid) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(cid),
    String(id)
  )
}

// Inject `count` synthetic LiveEvents into a given context as if they arrived from the transport.
async function inject(page, cid, count, overrides = {}) {
  await page.evaluate(
    ({ cid, count, overrides }) => {
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
    },
    { cid, count, overrides }
  )
}

test.describe('Live Monitor dock — realtime store hoist', () => {
  test('feed and history survive navigation between tools', async ({ page }) => {
    await loginAndOpenApp(page)
    const id = await createConn(page, `e2e-mon-nav-${Date.now()}`)
    try {
      await gotoConn(page, id)
      await expect(page.locator('[data-test=monitor-dock]')).toBeVisible()

      await inject(page, id, 3)
      await expect(rows(page)).toHaveCount(3)

      // Navigate across tools — the dock lives outside <router-view>, so the feed must persist.
      await page.goto(`/#/c/${id}/jobs`)
      await expect(rows(page)).toHaveCount(3)
      await page.goto(`/#/c/${id}/failed`)
      await expect(rows(page)).toHaveCount(3)
      await page.goto(`/#/c/${id}/batches`)
      await expect(rows(page)).toHaveCount(3)
    } finally {
      await deleteConn(page, id)
    }
  })

  test('switching context swaps the stream atomically with no cross-context bleed', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-mon-a-${Date.now()}`)
    const b = await createConn(page, `e2e-mon-b-${Date.now()}`)
    try {
      await gotoConn(page, a)
      await inject(page, a, 2, { text: 'AAA', queue: 'alpha' })
      await expect(rows(page)).toHaveCount(2)
      await expect(page.locator('[data-test=monitor-row]').first()).toContainText('AAA')

      // Switch to B: the feed must swap to B's events only — none of A's.
      await gotoConn(page, b)
      await inject(page, b, 3, { text: 'BBB', queue: 'beta' })
      await expect(rows(page)).toHaveCount(3)
      await expect(page.getByText('AAA').first()).toHaveCount(0)
      await expect(page.locator('[data-test=monitor-row]').first()).toContainText('BBB')

      // Switch back to A: A's retained history is intact, with no B bleed.
      await gotoConn(page, a)
      await expect(rows(page)).toHaveCount(2)
      await expect(page.getByText('BBB')).toHaveCount(0)
      await expect(page.locator('[data-test=monitor-row]').first()).toContainText('AAA')
    } finally {
      await deleteConn(page, a)
      await deleteConn(page, b)
    }
  })

  test('pause holds the feed, resume resumes, and the multi-column filter narrows it', async ({ page }) => {
    await loginAndOpenApp(page)
    const id = await createConn(page, `e2e-mon-pause-${Date.now()}`)
    try {
      await gotoConn(page, id)
      // Disable auto-resume so the pause assertion is stable.
      await page.evaluate(() => { window.__cbqmRealtime.autoResumeMs = 0 })

      await inject(page, id, 2)
      await expect(rows(page)).toHaveCount(2)

      // Pause → new events are held, the visible feed is frozen.
      await page.locator('[data-test=dock-pause]').click()
      await inject(page, id, 2)
      await expect(rows(page)).toHaveCount(2)
      await expect(page.locator('[data-test=monitor-held]')).toContainText('2 new while paused')

      // Resume → the feed flows again.
      await page.locator('[data-test=dock-pause]').click()
      await inject(page, id, 3)
      await expect(rows(page)).toHaveCount(5)

      // Multi-column filter: inject a distinct queue and narrow to it.
      await inject(page, id, 2, { queue: 'imports', mapping: 'ImportCsvJob', text: 'imp' })
      await expect(rows(page)).toHaveCount(7)
      await page.locator('[data-test=dock-filter-queue]').fill('imports')
      await expect(rows(page)).toHaveCount(2)
      await page.locator('[data-test=dock-filter-queue]').fill('')
      await expect(rows(page)).toHaveCount(7)
    } finally {
      await deleteConn(page, id)
    }
  })
})
