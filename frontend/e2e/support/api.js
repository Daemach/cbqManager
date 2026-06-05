// Reusable API helpers for E2E specs that drive the REST API directly (through the Vite proxy).
import { expect } from '@playwright/test'
import { DEFAULT_ADMIN } from './app.js'

/** Log in via the API and return the bearer token. */
export async function apiToken(ctx, creds = DEFAULT_ADMIN) {
  const res = await ctx.post('/api/login', { data: creds })
  expect(res.ok(), `login failed: ${await res.text()}`).toBeTruthy()
  return (await res.json()).data
}

/** Authorization header struct for a token. */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}
