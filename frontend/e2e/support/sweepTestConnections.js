// Delete every leaked test Connection (e2e-* / TEST_*) from the dev own store, using an admin token.
// Shared by global-setup (sweep at START so a dirty store from a previous failed run can't collide on
// a fixed-name create) and global-teardown (sweep at END so this run leaves the store clean).
// Best-effort; never touches non-test Connections (e.g. the seeded FTDIQueue). Issue #24.
import { request } from '@playwright/test'
import { ORIGIN } from './auth-state.js'

// Prefixes the e2e specs (e2e-*) and the backend integration specs (TEST_*) use for throwaway rows.
const TEST_NAME = /^(e2e|TEST)/i

/** Delete all e2e- and TEST_ prefixed Connections; returns the count actually deleted. */
export async function sweepTestConnections(token) {
  const ctx = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  let swept = 0
  try {
    const res = await ctx.get(`${ORIGIN}/api/connections`)
    if (!res.ok()) return 0
    const conns = (await res.json()).data || []
    for (const c of conns.filter((c) => TEST_NAME.test(c.name || ''))) {
      const del = await ctx.delete(`${ORIGIN}/api/connections/${c.id}`).catch(() => null)
      if (del && del.ok()) swept++
    }
  } catch {
    // best-effort — never throw from a sweep
  } finally {
    await ctx.dispose()
  }
  return swept
}
