import { test, expect } from '@playwright/test'
import { loginAndOpenApp, collectErrors } from './support/app.js'

// Drives the Connections CRUD entirely through the UI: create -> edit -> delete.
// Uses a unique name per run so reruns stay isolated; cleans up at the end.
test.describe('Connections UI', () => {
  test('admin can create, edit, and delete a connection via the UI', async ({ page }) => {
    const errors = collectErrors(page)
    const name = `e2e-ui-${Date.now()}`
    const renamed = `${name}-edited`

    await loginAndOpenApp(page) // lands on Connections

    // --- Create --- (q-input forwards data-test to the inner <input>)
    await page.locator('[data-test=add-connection]').click()
    await page.locator('[data-test=conn-name]').fill(name)
    await page.locator('[data-test=conn-datasourceClass]').fill('com.microsoft.sqlserver.jdbc.SQLServerDriver')
    await page.locator('[data-test=conn-connectionString]').fill('jdbc:sqlserver://localhost;databaseName=ftdiQueue')
    await page.locator('[data-test=conn-username]').fill('sa')
    await page.locator('[data-test=conn-password]').fill('e2e-secret-pw')
    await page.locator('[data-test=save-connection]').click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()

    // --- Edit (rename) ---
    await page.locator(`[data-test="edit-${name}"]`).click()
    const nameInput = page.locator('[data-test=conn-name]')
    await expect(nameInput).toHaveValue(name) // dialog pre-filled
    await nameInput.fill(renamed)
    await page.locator('[data-test=save-connection]').click()
    await expect(page.getByText(renamed, { exact: true })).toBeVisible()
    await expect(page.getByText(name, { exact: true })).toHaveCount(0)

    // --- Delete ---
    await page.locator(`[data-test="delete-${renamed}"]`).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(renamed, { exact: true })).toHaveCount(0)

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
  })
})
