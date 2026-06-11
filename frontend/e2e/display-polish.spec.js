import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// Issue #23 — display polish: copyable payload dialog, human-readable timestamps + elapsed, and a
// Message-first Live Monitor feed. The e2e Connections point at an unreachable DB, so we STUB each
// tool's list endpoint with rows carrying the real row shapes (payload/memento/options + hr*/epoch
// fields), then assert the surfacing behaviour. Stub shape matches what the views consume:
// { data:[...], pagination:{ totalRecords } }.

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
function stub(page, urlGlob, data) {
  return page.route(urlGlob, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { totalRecords: data.length } }) })
  )
}
function dataRows(page, tableTest) {
  return page.locator(`[data-test=${tableTest}] tbody tr:not(:has(td[colspan]))`)
}

// Fixed-now reference so relative labels are deterministic-ish: build timestamps relative to now.
const isoMinutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')

test.describe('Display polish — payload, timestamps, monitor columns (#23)', () => {
  test('Jobs: payload dialog opens, shows pretty JSON, Copy notifies; hr/elapsed columns render', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/jobs**', [
      {
        id: 900, queue: 'emails', state: 'reserved', attempts: 1,
        payload: '{"mapping":"SendWelcomeEmailJob","properties":{"userId":42}}',
        hrCreatedDate: isoMinutesAgo(8), hrReservedDate: isoMinutesAgo(3),
        hrCompletedDate: '', hrFailedDate: '', elapsed: 12, totalTime: 12
      }
    ])
    const id = await createConn(page, `e2e-23-jobs-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/jobs`)
      await expect(page.locator('[data-test=jobs-table]')).toBeVisible()
      const row = dataRows(page, 'jobs-table').first()

      // Human-readable timestamps + elapsed render with values (relative labels).
      await expect(row.locator('[data-test=job-created]')).toContainText('ago')
      await expect(row.locator('[data-test=job-reserved]')).toContainText('ago')
      await expect(row.locator('[data-test=job-elapsed]')).toContainText('12s')

      // Payload dialog: opens, pretty-prints JSON (indented), Copy fires a success notification.
      await page.locator('[data-test=payload-900]').click()
      const dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-kind]')).toHaveText('JSON')
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"mapping": "SendWelcomeEmailJob"')
      // Indented (pretty-printed) — a 2-space indent appears before a nested key.
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('  "properties"')

      await dialog.locator('[data-test=payload-copy]').click()
      await expect(page.locator('.q-notification').filter({ hasText: 'copied' })).toBeVisible()
      // The OS clipboard actually received the pretty JSON.
      const clip = await page.evaluate(() => navigator.clipboard.readText())
      expect(clip).toContain('"userId": 42')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Jobs: Mapping + Batch are extracted from the payload; a short payload previews on hover', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/jobs**', [
      { id: 901, queue: 'emails', state: 'available', attempts: 0, payload: '{"mapping":"UpdateDatamapsJob","batchId":"BATCH-XYZ"}', hrCreatedDate: isoMinutesAgo(2) },
      { id: 902, queue: 'emails', state: 'available', attempts: 0, payload: '{"mapping":"OrphanJob","batchId":null}', hrCreatedDate: isoMinutesAgo(2) }
    ])
    const id = await createConn(page, `e2e-mapping-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/jobs`)
      await expect(page.locator('[data-test=jobs-table]')).toBeVisible()
      const first = dataRows(page, 'jobs-table').first()
      // Mapping + Batch surfaced from the payload JSON.
      await expect(first).toContainText('UpdateDatamapsJob')
      await expect(first).toContainText('BATCH-XYZ')
      // A null batchId renders the em-dash placeholder, not "null".
      await expect(dataRows(page, 'jobs-table').nth(1)).not.toContainText('null')

      // Short payload previews inline on hover (no dialog needed).
      await page.locator('[data-test=payload-901]').hover()
      await expect(page.locator('[data-test=payload-tip-901]')).toContainText('"mapping": "UpdateDatamapsJob"')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Jobs: non-JSON payload falls back to raw text; blank payload shows empty state', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/jobs**', [
      { id: 11, queue: 'q', state: 'available', attempts: 0, payload: 'not json here', hrCreatedDate: isoMinutesAgo(1) },
      { id: 12, queue: 'q', state: 'available', attempts: 0, payload: '', hrCreatedDate: isoMinutesAgo(1) }
    ])
    const id = await createConn(page, `e2e-23-jobs-raw-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/jobs`)
      await expect(page.locator('[data-test=jobs-table]')).toBeVisible()

      await page.locator('[data-test=payload-11]').click()
      let dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog.locator('[data-test=payload-kind]')).toHaveText('raw')
      await expect(dialog.locator('[data-test=payload-pre]')).toHaveText('not json here')
      await dialog.locator('[data-test=payload-close]').click()
      await expect(dialog).toBeHidden()

      await page.locator('[data-test=payload-12]').click()
      dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog.locator('[data-test=payload-empty]')).toBeVisible()
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Failed Jobs: payload dialog reads the memento; Failed time renders relative', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/failed-jobs**', [
      {
        id: 77, queue: 'reports', mapping: 'ReportJob', fileName: 'a.cfc', lineNumber: 9,
        exceptionMessage: 'boom', failedDate: '2026-06-07 10:00:00', hrFailedDate: isoMinutesAgo(5),
        memento: '{"mapping":"ReportJob","currentAttempt":2}'
      }
    ])
    const id = await createConn(page, `e2e-23-failed-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/failed`)
      await expect(page.locator('[data-test=failed-table]')).toBeVisible()
      const row = dataRows(page, 'failed-table').first()
      await expect(row.locator('[data-test=failed-when]')).toContainText('ago')

      await page.locator('[data-test=payload-77]').click()
      const dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"mapping": "ReportJob"')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Failed Jobs: the exception button fetches the full stack trace on-demand (#26)', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/failed-jobs**', [
      { id: 88, queue: 'q', mapping: 'BoomJob', fileName: 'a.cfc', lineNumber: 9, exceptionMessage: 'boom', failedDate: '2026-06-07 10:00:00', hrFailedDate: isoMinutesAgo(3), memento: '{}' }
    ])
    // The detail endpoint returns the FULL exception (stripped from the list to avoid the OOM, #26).
    // Registered AFTER the list stub so it takes precedence for the /:id path.
    await page.route('**/api/connections/**/failed-jobs/88', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 88, exceptionStackTrace: 'java.lang.RuntimeException: boom\n  at Foo.bar(Foo.java:42)\n  at Baz.qux(Baz.java:7)' } }) })
    )
    const id = await createConn(page, `e2e-26-exc-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/failed`)
      await expect(page.locator('[data-test=failed-table]')).toBeVisible()
      await page.locator('[data-test=exception-88]').click()
      const dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('at Foo.bar(Foo.java:42)')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Batches: options dialog opens; Created renders relative; derived elapsed shows', async ({ page }) => {
    await loginAndOpenApp(page)
    const created = Math.floor(Date.now() / 1000) - 600
    const completed = created + 120 // 2m elapsed
    await stub(page, '**/api/connections/**/batches**', [
      { id: 'b1', name: 'NightlyBatch', createdDate: created, completedDate: completed, totalJobs: 5, pendingJobs: 0, failedJobs: 0, options: '{"finallyJob":{"mapping":"notify.send"}}' }
    ])
    const id = await createConn(page, `e2e-23-batches-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/batches`)
      await expect(page.locator('[data-test=batches-table]')).toBeVisible()
      const row = dataRows(page, 'batches-table').first()
      await expect(row.locator('[data-test=batch-created]')).toContainText('ago')
      await expect(row.locator('[data-test=batch-elapsed]')).toContainText('2m')

      await page.locator('[data-test=payload-b1]').click()
      const dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"finallyJob"')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Live Monitor: Message is the widest feed column; others are tightened', async ({ page }) => {
    await loginAndOpenApp(page)
    // Drive a synthetic event into the dock via the dev emit affordance is overkill; instead assert
    // the header layout: Message column header is widest, the narrow columns are narrower than it.
    const dock = page.locator('[data-test=monitor-dock]')
    await expect(dock).toBeVisible()
    const headers = dock.locator('.dock-table thead th')
    const labels = await headers.allInnerTexts()
    expect(labels).toEqual(['Time', 'Queue', 'State', 'Instance', 'Mapping', 'Job', 'Message'])

    const widths = []
    for (let i = 0; i < (await headers.count()); i++) {
      const box = await headers.nth(i).boundingBox()
      widths.push(box ? box.width : 0)
    }
    const messageWidth = widths[widths.length - 1]
    const others = widths.slice(0, -1)
    // Message is strictly the widest column, and every tightened column is narrower than it.
    expect(messageWidth).toBeGreaterThan(Math.max(...others))
  })
})
