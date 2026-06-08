import { test, expect } from '@playwright/test'
import { loginAndOpenApp } from './support/app.js'
import { authHeader } from './support/api.js'

// Issue #16 — recent-first / date-desc house style (PRD-0002 'Tables, sorting & pagination').
// Every data table must land the operator on the NEWEST row without paging or re-sorting. The e2e
// Connections point at an unreachable DB, so we STUB each tool's list endpoint with rows whose order
// proves recent-first, then assert the first VISIBLE row is the most recent and the sort controls
// still work. Stubs return the response shape the views consume: { data:[...], pagination:{ totalRecords } }.

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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data, pagination: { totalRecords: data.length } })
    })
  )
}

// Data rows only — Quasar virtual-scroll injects empty spacer rows (<tr><td colspan=N></td></tr>) at
// the top/bottom of the tbody. Real data rows have per-column cells (no colspan), so exclude any row
// containing a colspan cell to read the first VISIBLE data row, not a spacer.
function dataRows(page, tableTest) {
  return page.locator(`[data-test=${tableTest}] tbody tr:not(:has(td[colspan]))`)
}
function firstRowCells(page, tableTest) {
  return dataRows(page, tableTest).first().locator('td')
}

test.describe('Recent-first / date-desc data tables (#16)', () => {
  test('Jobs lands on the newest Job (highest id) first', async ({ page }) => {
    await loginAndOpenApp(page)
    // Server returns id-desc; the newest job (id 900) must be the first visible row.
    await stub(page, '**/api/connections/**/jobs**', [
      { id: 900, queue: 'emails', state: 'available', attempts: 0 },
      { id: 850, queue: 'emails', state: 'reserved', attempts: 1 },
      { id: 200, queue: 'reports', state: 'available', attempts: 0 }
    ])
    const id = await createConn(page, `e2e-sort-jobs-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/jobs`)
      const table = page.locator('[data-test=jobs-table]')
      await expect(table).toBeVisible()
      // Recent-first: the newest Job (id 900) is the first visible row, the oldest (200) is last.
      await expect(firstRowCells(page, 'jobs-table').first()).toHaveText('900')
      await expect(dataRows(page, 'jobs-table').last().locator('td').first()).toHaveText('200')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Failed Jobs lands on the most recent failure (failedDate desc) first', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/failed-jobs**', [
      { id: 3, failedDate: '2026-06-07 10:00:00', queue: 'emails', mapping: 'NewestJob', fileName: 'a.cfc', lineNumber: 1, exceptionMessage: 'newest' },
      { id: 2, failedDate: '2026-06-06 10:00:00', queue: 'emails', mapping: 'MiddleJob', fileName: 'b.cfc', lineNumber: 2, exceptionMessage: 'middle' },
      { id: 1, failedDate: '2026-06-05 10:00:00', queue: 'reports', mapping: 'OldestJob', fileName: 'c.cfc', lineNumber: 3, exceptionMessage: 'oldest' }
    ])
    const id = await createConn(page, `e2e-sort-failed-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/failed`)
      const table = page.locator('[data-test=failed-table]')
      await expect(table).toBeVisible()
      // First visible row is the newest failure; the oldest is last (failedDate desc).
      await expect(dataRows(page, 'failed-table').first()).toContainText('NewestJob')
      await expect(dataRows(page, 'failed-table').last()).toContainText('OldestJob')
    } finally {
      await deleteConn(page, id)
    }
  })

  test('Batches lands on the newest batch (createdDate desc) first and the Created column sorts', async ({ page }) => {
    await loginAndOpenApp(page)
    await stub(page, '**/api/connections/**/batches**', [
      { id: 30, name: 'NewestBatch', createdDate: 3000, totalJobs: 5, pendingJobs: 1, failedJobs: 0 },
      { id: 20, name: 'MiddleBatch', createdDate: 2000, totalJobs: 4, pendingJobs: 0, failedJobs: 1 },
      { id: 10, name: 'OldestBatch', createdDate: 1000, totalJobs: 3, pendingJobs: 0, failedJobs: 0 }
    ])
    const id = await createConn(page, `e2e-sort-batches-${Date.now()}`)
    try {
      await page.goto(`/#/c/${id}/batches`)
      const table = page.locator('[data-test=batches-table]')
      await expect(table).toBeVisible()
      // Newest batch first on load (createdDate desc).
      await expect(dataRows(page, 'batches-table').first()).toContainText('NewestBatch')

      // Sorting controls still work: clicking the (unsorted) Name header re-sorts ascending by name —
      // Middle < Newest < Oldest — so the first row changes to MiddleBatch.
      await table.locator('thead th', { hasText: 'Name' }).click()
      await expect(dataRows(page, 'batches-table').first()).toContainText('MiddleBatch')
    } finally {
      await deleteConn(page, id)
    }
  })
})
