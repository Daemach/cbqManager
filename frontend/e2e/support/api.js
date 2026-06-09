// Reusable API helpers for E2E specs that drive the REST API directly (through the Vite proxy).
import { expect } from '@playwright/test'
import { DEFAULT_ADMIN } from './app.js'
import { sharedToken } from './auth-state.js'

/**
 * Return the bearer token for API requests. For the default admin (the common case) this REUSES
 * the single token minted once in global setup (issue #24) — no per-test /api/login, so the API
 * helpers stop contending on the auth path under high worker counts. For non-default creds it logs
 * in fresh. Signature is unchanged so specs don't change.
 */
export async function apiToken(ctx, creds = DEFAULT_ADMIN) {
  if (creds === DEFAULT_ADMIN || (creds.username === DEFAULT_ADMIN.username && creds.password === DEFAULT_ADMIN.password)) {
    return sharedToken()
  }
  const res = await ctx.post('/api/login', { data: creds })
  expect(res.ok(), `login failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()).data
}

/** Authorization header struct for a token. */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}
