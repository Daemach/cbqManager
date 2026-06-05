import { test, expect } from '@playwright/test'
import { login, loginAndOpenApp, collectErrors } from './support/app.js'

test.describe('Authentication', () => {
  test('unauthenticated visit shows the login screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('admin can log in and reach the Connections dashboard', async ({ page }) => {
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
})
