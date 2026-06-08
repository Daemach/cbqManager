import { test, expect } from '@playwright/test'
import { loginAndOpenApp, openPicker } from './support/app.js'
import { authHeader } from './support/api.js'

// Connection context tabs (PRD-0002 top zone). Tabs are driven through the real SPA; live activity
// is injected via the dev seam (window.__cbqmRealtime) so badge/atomic-swap assertions are
// deterministic. Connections are created without a Broadcast Connection so no real socket opens.

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
  return { id: String((await res.json()).data.id), name }
}

async function deleteConn(page, id) {
  await page.request.delete(`/api/connections/${id}`, { headers: authHeader(await token(page)) }).catch(() => {})
}

async function waitActive(page, cid) {
  await page.waitForFunction(
    (id) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(id),
    String(cid)
  )
}

// Open a tab via the rich toolbar picker (the per-row Open button). The picker list is loaded at
// mount, so callers must reload after creating Connections for them to appear.
async function openViaPicker(page, conn) {
  const menu = await openPicker(page)
  await menu.locator(`[data-test=open-${conn.id}]`).click()
  await expect(page.locator(`[data-test=tab-${conn.id}]`)).toBeVisible()
  await waitActive(page, conn.id)
}

// Open a tab by navigating to it (deep-link path) — independent of the picker's loaded list.
async function openByNav(page, conn) {
  await page.goto(`/#/c/${conn.id}/health`)
  await expect(page.locator(`[data-test=tab-${conn.id}]`)).toBeVisible()
  await waitActive(page, conn.id)
}

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

const isActive = (page, cid) => page.locator(`[data-test=tab-${cid}][aria-selected="true"]`)

test.describe('Connection context tabs', () => {
  test('opens Connections as tabs via the picker and switches context atomically', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-tab-a-${Date.now()}`)
    const b = await createConn(page, `e2e-tab-b-${Date.now()}`)
    try {
      await page.reload() // refresh the picker list so the new Connections appear
      await openViaPicker(page, a)
      await inject(page, a.id, 2, { text: 'AAA' })
      await expect(rows(page)).toHaveCount(2)
      await expect(isActive(page, a.id)).toBeVisible()

      await openViaPicker(page, b)
      await inject(page, b.id, 3, { text: 'BBB' })
      await expect(rows(page)).toHaveCount(3)
      await expect(page.getByText('AAA')).toHaveCount(0) // no bleed

      // Click the A tab — atomic swap back: A's retained feed, no B bleed.
      await page.locator(`[data-test=tab-${a.id}]`).click()
      await expect(isActive(page, a.id)).toBeVisible()
      await expect(rows(page)).toHaveCount(2)
      await expect(page.getByText('BBB')).toHaveCount(0)
    } finally {
      await deleteConn(page, a.id)
      await deleteConn(page, b.id)
    }
  })

  test('each tab remembers its tool screen and restores it on re-activation', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-tab-tool-a-${Date.now()}`)
    const b = await createConn(page, `e2e-tab-tool-b-${Date.now()}`)
    try {
      await openByNav(page, a)
      // Move A onto the Jobs tool via a real in-app navigation, then switch away and back.
      await page.locator('[data-test=tool-jobs]').click()
      await expect(page).toHaveURL(new RegExp(`/c/${a.id}/jobs`))

      await openByNav(page, b) // B opens on default (health)
      await expect(page).toHaveURL(new RegExp(`/c/${b.id}/health`))

      await page.locator(`[data-test=tab-${a.id}]`).click()
      await expect(page).toHaveURL(new RegExp(`/c/${a.id}/jobs`)) // resumed where A left off
    } finally {
      await deleteConn(page, a.id)
      await deleteConn(page, b.id)
    }
  })

  test('closing the active tab activates a neighbor', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-tab-close-a-${Date.now()}`)
    const b = await createConn(page, `e2e-tab-close-b-${Date.now()}`)
    const c = await createConn(page, `e2e-tab-close-c-${Date.now()}`)
    try {
      await openByNav(page, a)
      await openByNav(page, b)
      await openByNav(page, c) // active = c (last)

      await page.locator(`[data-test=tab-close-${c.id}]`).click()
      await expect(page.locator(`[data-test=tab-${c.id}]`)).toHaveCount(0)
      await expect(isActive(page, b.id)).toBeVisible() // previous neighbor
      await expect(page).toHaveURL(new RegExp(`/c/${b.id}/`))
    } finally {
      await deleteConn(page, a.id)
      await deleteConn(page, b.id)
      await deleteConn(page, c.id)
    }
  })

  test('reload restores the open tabs, the active tab, and each tab last tool (cookie)', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-tab-restore-a-${Date.now()}`)
    const b = await createConn(page, `e2e-tab-restore-b-${Date.now()}`)
    try {
      await openByNav(page, a)
      await page.locator('[data-test=tool-jobs]').click() // remember A on Jobs
      await expect(page).toHaveURL(new RegExp(`/c/${a.id}/jobs`))
      await openByNav(page, b) // active = b on health

      // Make A the active tab so we can assert the active-tab restoration too.
      await page.locator(`[data-test=tab-${a.id}]`).click()
      await expect(page).toHaveURL(new RegExp(`/c/${a.id}/jobs`))

      // Reload: the cookie must rehydrate both tabs, the active one (A), and A's last tool (Jobs).
      await page.reload()
      await expect(page.locator(`[data-test=tab-${a.id}]`)).toBeVisible()
      await expect(page.locator(`[data-test=tab-${b.id}]`)).toBeVisible()
      await waitActive(page, a.id)
      await expect(isActive(page, a.id)).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/c/${a.id}/jobs`)) // resumed A's last tool
    } finally {
      await deleteConn(page, a.id)
      await deleteConn(page, b.id)
    }
  })

  test('a backgrounded tab badges its own activity', async ({ page }) => {
    await loginAndOpenApp(page)
    const a = await createConn(page, `e2e-tab-badge-a-${Date.now()}`)
    const b = await createConn(page, `e2e-tab-badge-b-${Date.now()}`)
    try {
      await openByNav(page, a)
      await openByNav(page, b) // active = b; a is backgrounded

      // Two error events arrive on the backgrounded A — its tab must badge (red error count).
      await inject(page, a.id, 2, { type: 'error', text: 'boom' })
      const badgeA = page.locator(`[data-test=tab-badge-${a.id}]`)
      await expect(badgeA).toHaveText('2')

      // The active B badges its own activity independently (no cross-bleed).
      await inject(page, b.id, 3)
      await expect(page.locator(`[data-test=tab-badge-${b.id}]`)).toHaveText('3')
      await expect(badgeA).toHaveText('2')
    } finally {
      await deleteConn(page, a.id)
      await deleteConn(page, b.id)
    }
  })
})
