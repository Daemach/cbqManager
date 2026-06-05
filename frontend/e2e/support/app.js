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

/** Log in and wait for the app shell (Connections dashboard) to render. */
export async function loginAndOpenApp(page, creds = DEFAULT_ADMIN) {
  await login(page, creds)
  await expect(page.getByText('cbqManager')).toBeVisible()
  // Unique to the Connections view (avoids the ambiguous "Connections" label in the drawer)
  await expect(page.getByRole('button', { name: 'Add Connection' })).toBeVisible()
}
