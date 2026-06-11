import { test, expect } from '@playwright/test'
import { loginAndOpenApp, openPicker, collectErrors } from './support/app.js'
import { authHeader } from './support/api.js'

// PRD-0002 stories 28–31 — the whole-tool quality walkthrough. ONE human-like, sequential pass over
// the entire reworked console, doubling as the UX-pass VIDEO evidence under PW_CAPTURE (video:'on').
//
// It must be DETERMINISTIC regardless of any real DB reachability or live Pusher: a single Connection
// is created via the API and every tool endpoint is STUBBED with representative rows (reusing the
// page.route { data:[...], pagination:{ totalRecords } } pattern from display-polish / table-sort),
// and the Live Monitor is driven through the dev seam (window.__cbqmRealtime.pushEvent), as in
// monitor-dock / live-filters / queue-drilldown. The happy-path tour never triggers the deliberate
// auth-403 / connection_unreachable-503 from the OTHER specs, so the browser console MUST end clean —
// that clean console is the regression-catch value of this walkthrough.

const rows = (page) => page.locator('[data-test=monitor-row]')
const token = (page) => page.evaluate(() => localStorage.getItem('cbqm_token'))

// Quasar virtual-scroll tables inject empty spacer rows (<tr><td colspan=N></td></tr>); real data
// rows have per-column cells, so exclude any row with a colspan cell.
function dataRows(page, tableTest) {
  return page.locator(`[data-test=${tableTest}] tbody tr:not(:has(td[colspan]))`)
}

const isoMinutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')

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
  return String((await res.json()).data.id)
}

async function deleteConn(page, id) {
  await page.request.delete(`/api/connections/${id}`, { headers: authHeader(await token(page)) }).catch(() => {})
}

// Fulfill a list endpoint with the response shape the views consume.
function stubList(page, urlGlob, data) {
  return page.route(urlGlob, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { totalRecords: data.length } }) })
  )
}

async function waitActive(page, cid) {
  await page.waitForFunction(
    (id) => window.__cbqmRealtime && String(window.__cbqmRealtime.activeId) === String(id),
    String(cid)
  )
}

// Inject one synthetic LiveEvent into a context via the dev seam (as if it arrived from the transport).
async function pushEvent(page, cid, ev) {
  await page.evaluate(({ cid, ev }) => window.__cbqmRealtime.pushEvent(String(cid), ev), { cid, ev })
}

test.describe('Whole-tool quality walkthrough (#9, PRD-0002 28–31)', () => {
  test('a human operator drives the entire reworked console end to end with a clean console', async ({ page }) => {
    const errors = collectErrors(page)

    // 1. Land on the shell.
    await loginAndOpenApp(page)

    // Stub every tool endpoint with representative data so the tour is deterministic regardless of
    // any real DB reachability. /failed-jobs/:id is registered AFTER the list stub so the more
    // specific :id route wins for the detail fetch.
    await stubList(page, '**/api/connections/**/health**', [
      { queue: 'emails', openTotal: 7, orphanedBlockers: 0, pickableFresh: 5, pickableReservedTimedout: 0, inFlight: 2, scheduledFuture: 0 },
      { queue: 'reports', openTotal: 3, orphanedBlockers: 1, pickableFresh: 2, pickableReservedTimedout: 0, inFlight: 0, scheduledFuture: 1 },
      { queue: 'imports', openTotal: 0, orphanedBlockers: 0, pickableFresh: 0, pickableReservedTimedout: 0, inFlight: 0, scheduledFuture: 0 }
    ])
    await stubList(page, '**/api/connections/**/jobs**', [
      {
        id: 920, queue: 'emails', state: 'reserved', attempts: 1,
        payload: '{"mapping":"SendWelcomeEmailJob","batchId":"BATCH-7F3","properties":{"userId":42}}',
        hrCreatedDate: isoMinutesAgo(9), hrReservedDate: isoMinutesAgo(2),
        hrCompletedDate: '', hrFailedDate: '', elapsed: 18, totalTime: 18
      },
      {
        id: 880, queue: 'reports', state: 'available', attempts: 0,
        payload: '{"mapping":"BuildReportJob","batchId":null}',
        hrCreatedDate: isoMinutesAgo(4), hrReservedDate: '', hrCompletedDate: '', hrFailedDate: '', elapsed: 0, totalTime: 0
      }
    ])
    await stubList(page, '**/api/connections/**/failed-jobs**', [
      {
        id: 770, queue: 'reports', mapping: 'BuildReportJob', fileName: 'ReportJob.cfc', lineNumber: 88,
        exceptionMessage: 'Report source unavailable', failedDate: '2026-06-09 10:00:00', hrFailedDate: isoMinutesAgo(6),
        memento: '{"mapping":"BuildReportJob","currentAttempt":3,"queue":"reports"}'
      }
    ])
    // Full exception/stack trace is fetched on-demand from the detail endpoint (#26/#34). Register
    // AFTER the list stub so it wins for the /:id path (per the gotcha).
    await page.route('**/api/connections/**/failed-jobs/770', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { id: 770, exceptionStackTrace: 'java.lang.RuntimeException: Report source unavailable\n  at ReportJob.run(ReportJob.cfc:88)\n  at cbq.Worker.process(Worker.cfc:204)' } })
      })
    )
    {
      const created = Math.floor(Date.now() / 1000) - 900
      const completed = created + 180 // 3m elapsed
      await stubList(page, '**/api/connections/**/batches**', [
        { id: 'b9', name: 'NightlyReports', createdDate: created, completedDate: completed, totalJobs: 12, pendingJobs: 0, failedJobs: 1, options: '{"finallyJob":{"mapping":"notify.opsDigest"},"allowFailures":true}' }
      ])
    }

    const id = await createConn(page, `e2e-walk-${Date.now()}`)
    try {
      // 2. Open the Connection via the toolbar picker; the default tool (Queue Health) renders.
      await page.reload() // refresh the picker list so the new Connection appears
      const menu = await openPicker(page)
      await menu.locator(`[data-test=open-${id}]`).click()
      await expect(page.locator(`[data-test=tab-${id}]`)).toBeVisible()
      await waitActive(page, id)

      await expect(page.locator('[data-test=health-table]')).toBeVisible()
      await expect(dataRows(page, 'health-table').first()).toContainText('emails')
      await expect(page.locator('[data-test=monitor-dock]')).toBeVisible()

      // Queue Health "Watch" drill-down → the Monitor dock shows the queue filter chip.
      // Seed a mixed feed first so the auto-filter visibly narrows it.
      await pushEvent(page, id, { queue: 'emails', state: 'reserved', mapping: 'SendWelcomeEmailJob', instance: 'worker-a', jobId: 920, type: 'info', text: 'reserved emails 920' })
      await pushEvent(page, id, { queue: 'reports', state: 'available', mapping: 'BuildReportJob', instance: 'worker-b', jobId: 880, type: 'info', text: 'available reports 880' })
      await expect(rows(page)).toHaveCount(2)

      await page.locator('[data-test="watch-emails"]').click()
      await expect(page.locator('[data-test=monitor-queue-filter]')).toContainText('queue: emails')
      await expect(rows(page)).toHaveCount(1)
      // Clear the drill-down filter to widen back before walking the tools.
      await page.locator('[data-test=monitor-queue-filter] .q-chip__icon--remove').click()
      await expect(page.locator('[data-test=monitor-queue-filter]')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(2)

      // 3a. Jobs — via the drawer tool. Mapping/Batch + Created/Elapsed columns render; payload dialog.
      await page.locator('[data-test=tool-jobs]').click()
      await expect(page).toHaveURL(new RegExp(`/c/${id}/jobs`))
      await expect(page.locator('[data-test=jobs-table]')).toBeVisible()
      const job = dataRows(page, 'jobs-table').first()
      await expect(job).toContainText('SendWelcomeEmailJob') // Mapping from payload
      await expect(job).toContainText('BATCH-7F3')           // Batch from payload
      await expect(job.locator('[data-test=job-created]')).toContainText('ago')
      await expect(job.locator('[data-test=job-elapsed]')).toContainText('18s')

      await page.locator('[data-test=payload-920]').click()
      let dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"mapping": "SendWelcomeEmailJob"')
      await dialog.locator('[data-test=payload-close]').click()
      await expect(dialog).toBeHidden()

      // 3b. Failed Jobs — via the drawer tool. Memento payload dialog AND the on-demand exception dialog.
      await page.locator('[data-test=tool-failed]').click()
      await expect(page).toHaveURL(new RegExp(`/c/${id}/failed`))
      await expect(page.locator('[data-test=failed-table]')).toBeVisible()
      const failed = dataRows(page, 'failed-table').first()
      await expect(failed).toContainText('BuildReportJob')
      await expect(failed.locator('[data-test=failed-when]')).toContainText('ago')

      await page.locator('[data-test=payload-770]').click()
      dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"mapping": "BuildReportJob"')
      await dialog.locator('[data-test=payload-close]').click()
      await expect(dialog).toBeHidden()

      await page.locator('[data-test=exception-770]').click()
      dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('at ReportJob.run(ReportJob.cfc:88)')
      await dialog.locator('[data-test=payload-close]').click()
      await expect(dialog).toBeHidden()

      // 3c. Batches — via a deep link. Options dialog opens; Created/Elapsed render.
      await page.locator('[data-test=tool-batches]').click()
      await expect(page).toHaveURL(new RegExp(`/c/${id}/batches`))
      await expect(page.locator('[data-test=batches-table]')).toBeVisible()
      const batch = dataRows(page, 'batches-table').first()
      await expect(batch).toContainText('NightlyReports')
      await expect(batch.locator('[data-test=batch-created]')).toContainText('ago')
      await expect(batch.locator('[data-test=batch-elapsed]')).toContainText('3m')

      await page.locator('[data-test=payload-b9]').click()
      dialog = page.locator('[data-test=payload-dialog]')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-test=payload-pre]')).toContainText('"finallyJob"')
      await dialog.locator('[data-test=payload-close]').click()
      await expect(dialog).toBeHidden()

      // The live feed and its history survived navigating across all three tools (dock is hoisted).
      await expect(rows(page)).toHaveCount(2)

      // 4. Live Monitor — drive a mix of events and exercise the filters/controls.
      // Add error + multi-instance + multi-queue traffic on top of the 2 seeded events.
      await pushEvent(page, id, { queue: 'imports', state: 'failed', mapping: 'ImportCsvJob', instance: 'worker-c', jobId: 5, type: 'error', text: 'import blew up', error: 'IOException', line: 'ImportCsvJob.cfc:12' })
      await pushEvent(page, id, { queue: 'emails', state: 'completed', mapping: 'SendWelcomeEmailJob', instance: 'worker-a', jobId: 921, type: 'info', text: 'completed emails 921' })
      await pushEvent(page, id, { queue: 'emails', state: 'reserved', mapping: 'SendWelcomeEmailJob', instance: 'worker-a', jobId: 922, type: 'info', text: 'reserved emails 922' })
      await expect(rows(page)).toHaveCount(5)

      // Error line is visually distinct (row-error class) and shows the parsed error.
      await expect(page.locator('[data-test=monitor-row].row-error')).toHaveCount(1)
      await expect(page.locator('[data-test=monitor-row].row-error')).toContainText('IOException')

      // Queue filter narrows to the emails traffic (3 of 5).
      await page.locator('[data-test=dock-filter-queue]').fill('emails')
      await expect(rows(page)).toHaveCount(3)
      await page.locator('[data-test=dock-filter-queue]').fill('')
      await expect(rows(page)).toHaveCount(5)

      // Clickable instance badge → instance chip; the feed narrows to that Worker.
      await page.locator('[data-test=monitor-instance-badge]', { hasText: 'worker-a' }).first().click()
      await expect(page.locator('[data-test=monitor-instance-filter]')).toContainText('instance: worker-a')
      await expect(page.locator('[data-test=dock-filter-instance]')).toHaveValue('worker-a')
      await expect(rows(page)).toHaveCount(3) // 920, 921, 922 are worker-a
      await page.locator('[data-test=monitor-instance-filter] .q-chip__icon--remove').click()
      await expect(page.locator('[data-test=monitor-instance-filter]')).toHaveCount(0)
      await expect(rows(page)).toHaveCount(5)

      // Lookback toggle — flip to a window and back to Live (all current events are "now", so the
      // window keeps them all; this exercises the control + per-context state without flakiness).
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: '10m' }).click()
      await expect(page.locator('[data-test=dock-lookback]').getByRole('button', { name: '10m' }))
        .toHaveAttribute('aria-pressed', 'true')
      await expect(rows(page)).toHaveCount(5)
      await page.locator('[data-test=dock-lookback]').getByRole('button', { name: 'Live' }).click()
      await expect(rows(page)).toHaveCount(5)

      // Pause holds new events (the visible feed freezes; the held count surfaces so it isn't silently
      // stale). Resume unfreezes — subsequent events flow into the feed again.
      await page.evaluate(() => { window.__cbqmRealtime.autoResumeMs = 0 }) // stabilize the pause assertion
      await page.locator('[data-test=dock-pause]').click()
      await pushEvent(page, id, { queue: 'emails', state: 'reserved', mapping: 'SendWelcomeEmailJob', instance: 'worker-a', jobId: 923, type: 'info', text: 'held while paused' })
      await expect(rows(page)).toHaveCount(5) // frozen
      await expect(page.locator('[data-test=monitor-held]')).toContainText('1 new while paused')
      await page.locator('[data-test=dock-pause]').click() // resume
      await expect(page.locator('[data-test=monitor-held]')).toHaveCount(0)
      await pushEvent(page, id, { queue: 'emails', state: 'completed', mapping: 'SendWelcomeEmailJob', instance: 'worker-a', jobId: 924, type: 'info', text: 'flows after resume' })
      await expect(rows(page)).toHaveCount(6)

      // Clear sweeps the feed.
      await page.locator('[data-test=dock-clear]').click()
      await expect(rows(page)).toHaveCount(0)
      await expect(page.locator('[data-test=monitor-empty]')).toBeVisible()

      // 5. The whole happy-path tour must have produced NO console/page errors.
      expect(errors, `unexpected console/page errors during the walkthrough:\n${errors.join('\n')}`).toEqual([])
    } finally {
      await deleteConn(page, id)
    }
  })
})
