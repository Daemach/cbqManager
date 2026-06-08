import { test, expect } from '@playwright/test'
import { loginAndOpenApp, openPicker, collectErrors } from './support/app.js'

// Drives Connection CRUD entirely through the toolbar Connection picker (Console layout v2, issue
// #18): Add -> edit -> delete, all from the rich picker (there is no more Connections page).
// Uses a unique name per run so reruns stay isolated; cleans up at the end.
test.describe('Connections UI (picker)', () => {
  test('admin can create, edit, and delete a Connection via the picker', async ({ page }) => {
    const errors = collectErrors(page)
    const name = `e2e-ui-${Date.now()}`
    const renamed = `${name}-edited`

    await loginAndOpenApp(page)

    // --- Create (Add Connection entry in the picker → shared editor dialog) ---
    let menu = await openPicker(page)
    await menu.locator('[data-test=add-connection]').click()
    await page.locator('[data-test=conn-name]').fill(name)
    await page.locator('[data-test=conn-datasourceClass]').fill('com.microsoft.sqlserver.jdbc.SQLServerDriver')
    await page.locator('[data-test=conn-connectionString]').fill('jdbc:sqlserver://localhost;databaseName=ftdiQueue')
    await page.locator('[data-test=conn-username]').fill('sa')
    await page.locator('[data-test=conn-password]').fill('e2e-secret-pw')
    await page.locator('[data-test=save-connection]').click()

    // The new Connection shows up as a row in the picker.
    menu = await openPicker(page)
    await expect(menu.getByText(name, { exact: true })).toBeVisible()

    // --- Edit (rename) via the picker's per-row edit button ---
    await menu.locator(`[data-test="edit-${name}"]`).click()
    const nameInput = page.locator('[data-test=conn-name]')
    await expect(nameInput).toHaveValue(name) // dialog pre-filled
    // The dialog auto-focuses its first field (general console rule).
    await expect(nameInput).toBeFocused()
    await nameInput.fill(renamed)
    await page.locator('[data-test=save-connection]').click()

    menu = await openPicker(page)
    await expect(menu.getByText(renamed, { exact: true })).toBeVisible()
    await expect(menu.getByText(name, { exact: true })).toHaveCount(0)

    // --- Delete via the picker's per-row delete button ---
    await menu.locator(`[data-test="delete-${renamed}"]`).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    menu = await openPicker(page)
    await expect(menu.getByText(renamed, { exact: true })).toHaveCount(0)

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
  })
})
