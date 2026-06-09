// Playwright global setup: log in ONCE (admin via the REST API) and persist an authenticated
// storageState so every spec starts already-authenticated. This removes the per-spec /api/login
// call that, under high worker counts, contended on the JWT/CacheBox auth path and intermittently
// timed out the suite at the login picker (issue #24).
//
// The token is written into localStorage under `cbqm_token` (the key frontend/src/services/api.js
// getToken() reads) for the SPA origin, AND mirrored to a sidecar token file so the API helpers
// (support/api.js) can reuse the SAME token instead of each minting a fresh one.
import { request } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { STORAGE_STATE_PATH, TOKEN_FILE_PATH, ORIGIN, TOKEN_KEY } from './auth-state.js'
import { sweepTestConnections } from './sweepTestConnections.js'

const DEFAULT_ADMIN = { username: 'admin', password: 'password' }

// The JWT/CacheBox auth path can transiently reject a login right after a heavy run (issue #24).
// Retry a few times so the one-time setup login is robust — once we hold the token, the whole
// suite reuses it and never logs in again.
async function loginWithRetry(ctx, attempts = 5) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await ctx.post(`${ORIGIN}/api/login`, { data: DEFAULT_ADMIN })
      if (res.ok()) {
        const token = (await res.json()).data
        if (token) return token
        lastErr = new Error('login returned no token')
      } else {
        lastErr = new Error(`login failed (${res.status()}): ${await res.text()}`)
      }
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)))
  }
  throw new Error(`global-setup login failed after ${attempts} attempts: ${lastErr?.message || lastErr}`)
}

export default async function globalSetup() {
  const ctx = await request.newContext()
  try {
    const token = await loginWithRetry(ctx)

    const storageState = {
      cookies: [],
      origins: [ { origin: ORIGIN, localStorage: [ { name: TOKEN_KEY, value: token } ] } ]
    }

    mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true })
    writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
    writeFileSync(TOKEN_FILE_PATH, token)

    // Start clean: sweep any leaked test Connections from a previous failed run BEFORE the suite, so
    // a fixed-name create (e.g. e2e-sample-connection) can't collide with a stale row (issue #24).
    const swept = await sweepTestConnections(token)
    if (swept) console.log(`[setup] swept ${swept} pre-existing test Connection(s)`)
  } finally {
    await ctx.dispose()
  }
}
