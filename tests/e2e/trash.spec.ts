import type { Page } from '@playwright/test'
import { expect, signIn, test } from './support/users'

const tree = (page: Page) => page.getByRole('navigation', { name: 'Notes' })
const trash = (page: Page) => page.getByRole('region', { name: 'Trash' })

async function createNote(page: Page, title: string, body: string) {
  await page.getByLabel('New note title').fill(title)
  await page.getByRole('button', { name: 'Create note' }).click()
  await page.getByRole('textbox', { name: 'Note body' }).click()
  await page.keyboard.type(body)
  await expect(page.getByRole('status')).toHaveText('All changes saved')
}

test('a deleted note goes to the trash, can be restored, and can be deleted forever', async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)
  await createNote(page, 'Groceries', 'milk and eggs')

  await page.getByRole('button', { name: 'Delete note Groceries' }).click()
  await expect(tree(page).getByRole('button', { name: 'Groceries', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Note body' })).toHaveCount(0)

  await page.getByRole('button', { name: /^Trash/ }).click()
  await expect(trash(page).getByText('Groceries')).toBeVisible()
  await trash(page).getByRole('button', { name: 'Restore Groceries' }).click()
  await expect(trash(page).getByText('Groceries')).toHaveCount(0)
  await tree(page).getByRole('button', { name: 'Groceries', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Note body' })).toHaveText('milk and eggs')

  // Deleting forever asks first, because it can't be undone.
  await page.getByRole('button', { name: 'Delete note Groceries' }).click()
  page.once('dialog', (dialog) => void dialog.dismiss())
  await trash(page).getByRole('button', { name: 'Delete Groceries forever' }).click()
  await expect(trash(page).getByText('Groceries')).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept())
  await trash(page).getByRole('button', { name: 'Delete Groceries forever' }).click()
  await expect(trash(page).getByText('Groceries')).toHaveCount(0)
  await expect(trash(page)).toContainText('Trash is empty')

  await expect(page.getByRole('status')).toHaveText('All changes saved')
  await page.reload()
  await expect(page.getByLabel('New note title')).toBeVisible()
  await expect(tree(page).getByRole('button', { name: 'Groceries', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Trash/ }).click()
  await expect(trash(page)).toContainText('Trash is empty')
})

test('deleting a folder puts its notes in the trash, and restoring one brings the folder back', async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)
  await page.getByLabel('New folder name').fill('Recipes')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tree(page).getByRole('button', { name: 'Recipes', exact: true }).click()
  await createNote(page, 'Waffles', 'flour')

  await page.getByRole('button', { name: 'Delete folder Recipes' }).click()
  await expect(tree(page).getByRole('button', { name: 'Recipes', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /^Trash/ }).click()
  await expect(trash(page)).toContainText('Waffles')
  await expect(trash(page)).toContainText('Recipes')
  await trash(page).getByRole('button', { name: 'Restore Waffles' }).click()
  await expect(tree(page).getByRole('button', { name: 'Recipes', exact: true })).toBeVisible()
  await expect(tree(page).getByRole('button', { name: 'Waffles', exact: true })).toBeVisible()
})
