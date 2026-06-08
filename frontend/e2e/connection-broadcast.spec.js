import { test, expect } from '@playwright/test'
import { loginAndOpenApp, openPicker, collectErrors } from './support/app.js'
import { apiToken, authHeader } from './support/api.js'

// Slice #8 — configure realtime (a Broadcast Connection) for a Connection from the shared editor:
//   1. Create a Connection, picking the seeded "Development Pusher" Broadcast Connection + a
//      Channel + events CSV, all via the toolbar picker → editor dialog.
//   2. Reopen it → the Broadcast Connection / Channel / events are pre-filled.
//   3. GET /api/connections/:id/broadcast returns realtime:true with the PUBLIC pusher params and
//      NEVER the secret.
// Self-cleaning (deletes the Connection it creates) so reruns stay green.
test.describe('Connection broadcast (realtime) config via the editor', () => {
  test('link a Broadcast Connection, channel + events; reopen pre-filled; public broadcast config', async ({ page, playwright, baseURL }) => {
    const errors = collectErrors(page)
    const name = `e2e-rt-${Date.now()}`
    const ctx = await playwright.request.newContext({ baseURL })
    const auth = authHeader(await apiToken(ctx))
    let id

    try {
      await loginAndOpenApp(page)

      // --- Create with a Broadcast Connection picked + channel/events ---
      let menu = await openPicker(page)
      await menu.locator('[data-test=add-connection]').click()
      await page.locator('[data-test=conn-name]').fill(name)
      await page.locator('[data-test=conn-datasourceClass]').fill('com.microsoft.sqlserver.jdbc.SQLServerDriver')
      await page.locator('[data-test=conn-connectionString]').fill('jdbc:sqlserver://localhost;databaseName=ftdiQueue')
      await page.locator('[data-test=conn-username]').fill('sa')
      await page.locator('[data-test=conn-password]').fill('e2e-secret-pw')

      // Pick the seeded "Development Pusher" Broadcast Connection.
      await page.locator('[data-test=conn-broadcast]').click()
      await page.getByRole('option', { name: /Development Pusher/ }).click()
      // Channel + events surface once a Broadcast Connection is linked.
      await page.locator('[data-test=conn-channel]').fill('development')
      await page.locator('[data-test=conn-events]').fill('cbqWorker,cbqWorkerError')
      await page.locator('[data-test=save-connection]').click()

      // The new Connection shows up in the picker.
      menu = await openPicker(page)
      await expect(menu.getByText(name, { exact: true })).toBeVisible()

      // --- Reopen via edit → the realtime section is pre-filled ---
      await menu.locator(`[data-test="edit-${name}"]`).click()
      await expect(page.locator('[data-test=conn-name]')).toHaveValue(name)
      await expect(page.locator('[data-test=conn-channel]')).toHaveValue('development')
      await expect(page.locator('[data-test=conn-events]')).toHaveValue('cbqWorker,cbqWorkerError')
      // The Broadcast Connection select shows the linked Broadcast Connection's label (not "No realtime").
      await expect(page.locator('[data-test=conn-broadcast]')).toContainText(/Development Pusher/)
      // Close the dialog without changes.
      await page.getByRole('button', { name: 'Cancel' }).click()

      // --- Find the created Connection's id via the API, then assert its public broadcast config ---
      const list = (await (await ctx.get('/api/connections', { headers: auth })).json()).data
      const created = list.find((c) => c.name === name)
      expect(created, 'created Connection should be listed').toBeTruthy()
      id = created.id
      expect(created.broadcastConnectionId, 'Connection carries its broadcast link').toBeTruthy()

      const bcastRes = await ctx.get(`/api/connections/${id}/broadcast`, { headers: auth })
      expect(bcastRes.ok()).toBeTruthy()
      const bcast = (await bcastRes.json()).data
      expect(bcast.realtime).toBe(true)
      expect(bcast.transport).toBe('pusher')
      expect(bcast.channel).toBe('development')
      expect(bcast.events).toEqual(expect.arrayContaining([ 'cbqWorker', 'cbqWorkerError' ]))
      expect(bcast.publicParams.pusherKey, 'public pusher key present').toBeTruthy()
      // No secret ever crosses the wire.
      expect(bcast.publicParams).not.toHaveProperty('pusherSecret')
      expect(bcast.publicParams).not.toHaveProperty('pusherAppId')
      expect(JSON.stringify(bcast)).not.toContain('secret')

      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
    } finally {
      if (id) await ctx.delete(`/api/connections/${id}`, { headers: auth })
      await ctx.dispose()
    }
  })
})
