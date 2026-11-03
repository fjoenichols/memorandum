import { expect, test } from '@playwright/test'

test('a note written in the editor is still there after a reload', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('New note title').fill('Groceries')
  await page.getByRole('button', { name: 'Create note' }).click()

  const editor = page.getByRole('textbox', { name: 'Note body' })
  await editor.click()
  await page.keyboard.type('# Shopping\nmilk and eggs')
  await expect(editor).toContainText('milk and eggs')
  await expect(page.getByRole('status')).toHaveText('All changes saved')

  await page.reload()
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  const reopened = page.getByRole('textbox', { name: 'Note body' })
  await expect(reopened).toContainText('# Shopping')
  await expect(reopened).toContainText('milk and eggs')
})
