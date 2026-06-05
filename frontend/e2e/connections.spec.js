import { test, expect } from '@playwright/test'
import { apiToken, authHeader } from './support/api.js'

// Exercises the Connection Registry through the API: create (encrypts secrets), list, fetch
// (must NOT leak secrets), and delete. Self-cleaning so reruns stay green.
test.describe('Connections API', () => {
  const sample = {
    name: 'e2e-sample-connection',
    environment: 'development',
    grammar: 'SqlServerGrammar',
    datasourceClass: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
    connectionString: 'jdbc:sqlserver://localhost;databaseName=ftdiQueue',
    secrets: { username: 'sa', password: 'super-secret-pw' }
  }

  test('admin can create, list, fetch (no secret leak), and delete a Connection', async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL })
    const auth = authHeader(await apiToken(ctx))
    let id

    try {
      // create
      const createRes = await ctx.post('/api/connections', { headers: auth, data: sample })
      expect(createRes.ok(), `create failed: ${await createRes.text()}`).toBeTruthy()
      id = (await createRes.json()).data.id
      expect(id, 'create should return a new id').toBeTruthy()

      // list contains it
      const listRes = await ctx.get('/api/connections', { headers: auth })
      const list = (await listRes.json()).data
      expect(list.some((c) => c.name === sample.name)).toBeTruthy()

      // fetch by id — and CRUCIALLY no secrets leak to the client
      const showRes = await ctx.get(`/api/connections/${id}`, { headers: auth })
      const show = (await showRes.json()).data
      expect(show.name).toBe(sample.name)
      expect(show).not.toHaveProperty('secrets_enc')
      expect(show).not.toHaveProperty('password')
      expect(JSON.stringify(show)).not.toContain('super-secret-pw')
    } finally {
      if (id) {
        const delRes = await ctx.delete(`/api/connections/${id}`, { headers: auth })
        expect(delRes.ok()).toBeTruthy()
      }
      await ctx.dispose()
    }
  })

  test('viewer-less request is rejected (auth enforced)', async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL })
    const res = await ctx.get('/api/connections') // no token
    expect(res.status()).toBe(403)
    await ctx.dispose()
  })
})
