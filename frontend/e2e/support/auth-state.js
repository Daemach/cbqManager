// Shared constants + token accessor for the e2e auth storageState (issue #24).
// The global setup (global-setup.js) writes both files; the config and helpers read from here so
// there is a single source of truth for paths and the SPA origin.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The SPA origin Playwright drives (baseURL). localStorage in a storageState is keyed by origin,
// so this must match the page origin exactly.
export const ORIGIN = 'http://localhost:9000'

// localStorage key the SPA reads its bearer token from (frontend/src/services/api.js getToken()).
export const TOKEN_KEY = 'cbqm_token'

// Both files live under the gitignored .loop-artifacts/ folder (repo root) so they are never
// committed and the build loop never has to `rm`.
export const STORAGE_STATE_PATH = fileURLToPath(
  new URL('../../../.loop-artifacts/playwright/storage-state.json', import.meta.url)
)
export const TOKEN_FILE_PATH = fileURLToPath(
  new URL('../../../.loop-artifacts/playwright/auth-token.txt', import.meta.url)
)

/** Read the shared admin bearer token captured by global setup. */
export function sharedToken() {
  return readFileSync(TOKEN_FILE_PATH, 'utf8').trim()
}
