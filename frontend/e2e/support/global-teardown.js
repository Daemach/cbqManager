// Playwright global teardown: sweep any leaked test Connections (e2e-* / TEST_*) from the dev own
// store after the suite, so a spec that failed before its per-test cleanup can't accumulate rows
// (issue #24; user-reported "not cleaning up test connections"). Reuses the shared admin token from
// global-setup (no extra login). Never touches non-test Connections (e.g. the seeded FTDIQueue).
import { sharedToken } from './auth-state.js'
import { sweepTestConnections } from './sweepTestConnections.js'

export default async function globalTeardown() {
  let token
  try {
    token = sharedToken()
  } catch {
    return // global-setup never ran / no token — nothing to sweep
  }
  const swept = await sweepTestConnections(token)
  if (swept) console.log(`[teardown] swept ${swept} leaked test Connection(s)`)
}
