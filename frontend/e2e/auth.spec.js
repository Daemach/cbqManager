import { test, expect } from '@playwright/test'
import { login, loginAndOpenApp, collectErrors } from './support/app.js'

test.describe('Authentication', () => {
  test('unauthenticated visit shows the login screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('admin can log in and reach the console shell', async ({ page }) => {
    const errors = collectErrors(page)
    await loginAndOpenApp(page)
    // No client-side runtime errors (catches QPage-without-QLayout, etc.)
    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
  })

  test('bad credentials are rejected', async ({ page }) => {
    await login(page, { username: 'admin', password: 'wrong' })
    // Stays on the login screen; a negative notification appears
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('a forbidden/expired session notifies and redirects to login (no silent blank screen)', async ({ page }) => {
    await loginAndOpenApp(page)
    // Force the connections list to be forbidden — the real-world stale/under-privileged session that
    // returned 403 "Forbidden: connection.list" with no notification (the bug). The global handler
    // must surface it and bounce to login instead of leaving a silent blank screen.
    await page.route('**/api/connections', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: true, messages: [ 'Forbidden: connection.list' ] }) })
    )
    await page.reload()
    await expect(page).toHaveURL(/#\/login/)
    await expect(page.locator('.q-notification')).toContainText(/not authorized|forbidden/i)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
