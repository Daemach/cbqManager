// Reusable E2E helpers for the cbqManager SPA (akin to the reference's PlaywrightService/BaseSpec).
// Keep page-specific selectors and flows here so specs stay declarative and resilient.
import { expect } from '@playwright/test'

export const DEFAULT_ADMIN = { username: 'admin', password: 'password' }

/**
 * Attach console/page error collectors. Returns a live array of error strings.
 * Usage: const errors = collectErrors(page); ... expect(errors).toEqual([])
 */
export function collectErrors(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

/** Fill and submit the login form. Assumes the app is showing the login screen. */
export async function login(page, creds = DEFAULT_ADMIN) {
  await page.goto('/')
  const card = page.locator('.q-card')
  await expect(card).toBeVisible()
  await card.locator('input').first().fill(creds.username)
  await card.locator('input[type="password"]').fill(creds.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/**
 * Log in and wait for the app shell to render. Console layout v2 (issue #18) has no Connections
 * dashboard — the shell is the toolbar (with the Connections picker) + the persistent Live Monitor
 * dock. We wait on the picker button, which is always present once the layout mounts.
 *
 * Issue #24: most specs run with a shared authenticated storageState (the bearer token is already
 * in localStorage under `cbqm_token`), so there is no login form to fill — we just navigate into
 * the app shell. Only when no token is present (a clean/unauthenticated storageState, e.g. a
 * non-default `creds`) do we drive the login form. Signature is unchanged so specs don't change.
 */
export async function loginAndOpenApp(page, creds = DEFAULT_ADMIN) {
  await page.goto('/')
  const authenticated = await page.evaluate(() => !!localStorage.getItem('cbqm_token'))
  if (!authenticated) {
    await login(page, creds)
  }
  await expect(page.getByText('cbqManager')).toBeVisible()
  await expect(page.locator('[data-test=connection-picker]')).toBeVisible()
}

/**
 * Open the toolbar Connection picker menu (the rich picker that replaced the q-select + the
 * Connections page). Quasar's menu open can flake on a single click, so retry until it's visible.
 */
export async function openPicker(page) {
  const menu = page.locator('[data-test=connection-menu]')
  await expect(async () => {
    await page.locator('[data-test=connection-picker]').click()
    await expect(menu).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
  return menu
}
