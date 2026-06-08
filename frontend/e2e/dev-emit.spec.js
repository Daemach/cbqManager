import { test, expect } from '@playwright/test'
import { loginAndOpenApp, collectErrors } from './support/app.js'
import { apiToken, authHeader } from './support/api.js'

// #22 — the dev "emit test event" path, proven over the REAL transport (not the window.__cbqmRealtime
// seam). We open the seeded FTDIQueue Connection (already linked to the "Development Pusher" Broadcast
// Connection on the "development" channel, with a reachable dev DB), which subscribes via real
// pusher-js, then fire the dev emit. The HARD assertion is that the backend publish round-trips to
// Pusher (published:true / HTTP 200) — the secret never leaves the server. The DOCK-RECEIVES-THE-ROW
// assertion is BEST-EFFORT: real cloud delivery into a headless browser can be flaky/blocked, so a
// delivery timeout is reported but does not fail the run (monitor-dock.spec covers the store plumbing
// deterministically via the seam). Uses the seeded fixture (no throwaway Connection to clean up).

const rows = (page) => page.locator('[data-test=monitor-row]')

test.describe('Live Monitor — dev emit over the real transport (#22)', () => {
  test('emit publishes to Pusher (200) and best-effort lights up the dock', async ({ page, playwright, baseURL }) => {
    const errors = collectErrors(page)
    const ctx = await playwright.request.newContext({ baseURL })
    const auth = authHeader(await apiToken(ctx))

    try {
      // The seeded FTDIQueue Connection is the dev fixture: linked to Development Pusher + a reachable DB.
      const conns = (await (await ctx.get('/api/connections', { headers: auth })).json()).data
      const ftdi = conns.find((c) => c.name === 'FTDIQueue')
      expect(ftdi, 'seeded "FTDIQueue" Connection should exist (dev fixture)').toBeTruthy()
      expect(ftdi.broadcastConnectionId, 'FTDIQueue is linked to a Broadcast Connection').toBeTruthy()
      const id = ftdi.id

      // Confirm its public broadcast config is Pusher on the development channel.
      const bcast = (await (await ctx.get(`/api/connections/${id}/broadcast`, { headers: auth })).json()).data
      expect(bcast.realtime).toBe(true)
      expect(bcast.transport).toBe('pusher')

      await loginAndOpenApp(page)
      // Open the Connection — the dock subscribes to real Pusher for this context.
      await page.goto(`/#/c/${id}/health`)
      await expect(page.locator('[data-test=monitor-dock]')).toBeVisible()
      // Wait for the real subscription to go live (status chip flips to "live").
      await expect(page.locator('[data-test=monitor-status]')).toContainText('live', { timeout: 15000 })

      // The dev emit button is only rendered in DEV — it must be present here.
      await expect(page.locator('[data-test=dock-emit]')).toBeVisible()

      // HARD assertion: the backend publish round-trips to Pusher (200). Drive it via the API so the
      // assertion is on the publish result, independent of browser delivery.
      const emitRes = await ctx.post(`/api/dev/connections/${id}/emit`, {
        headers: auth,
        data: { eventType: 'cbqWorker', queue: 'emails', text: 'real round-trip emit' }
      })
      expect(emitRes.ok(), `emit failed: ${await emitRes.text()}`).toBeTruthy()
      const emit = (await emitRes.json()).data
      expect(emit.published, 'Pusher should accept the trigger (HTTP 200)').toBe(true)
      expect(emit.status).toBe(200)

      // BEST-EFFORT: also fire via the dock button (exercises the UI path), then wait for a row to
      // arrive over real pusher-js. A delivery timeout is reported, not fatal.
      await page.locator('[data-test=dock-emit]').click()
      let delivered = false
      try {
        await expect(rows(page).first()).toBeVisible({ timeout: 15000 })
        delivered = true
      } catch {
        delivered = false
      }
      // eslint-disable-next-line no-console
      console.log(`[dev-emit] real-transport dock delivery: ${delivered ? 'RECEIVED' : 'NOT received (best-effort, non-fatal)'}`)

      // Console must be clean (the [pusher] adapter logs are info/debug, not errors).
      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
    } finally {
      await ctx.dispose()
    }
  })
})
