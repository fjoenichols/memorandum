import type { Page } from '@playwright/test'
import { expect, signIn, test } from './support/users'

const contents = (page: Page, folder: string) => page.getByRole('list', { name: `${folder} contents`, exact: true })

test('creating folders back to back keeps every one, including nested paths', async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)
  for (const name of ['Recipes', 'Recipes/Desserts', 'Work']) {
    await page.getByLabel('New folder name').fill(name)
    await page.getByRole('button', { name: 'Create folder' }).click()
  }
  await expect(contents(page, 'Top level').getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await expect(contents(page, 'Recipes').getByRole('button', { name: 'Desserts', exact: true })).toBeVisible()
})

test('folders and notes can be created, renamed, moved, and deleted from the sidebar', async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)

  // Create a folder at the top level, then a note inside it.
  await page.getByLabel('New folder name').fill('Recipes')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await page.getByLabel('New note title').fill('Pancakes')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(contents(page, 'Recipes').getByRole('button', { name: 'Pancakes', exact: true })).toBeVisible()

  // Rename the note.
  await page.getByRole('button', { name: 'Rename note Pancakes' }).click()
  await page.getByLabel('New name for Pancakes').fill('Waffles')
  await page.getByLabel('New name for Pancakes').press('Enter')
  await expect(contents(page, 'Recipes').getByRole('button', { name: 'Waffles', exact: true })).toBeVisible()

  // Create a second top-level folder and move the note into it.
  await page.getByRole('button', { name: 'Top level' }).click()
  await page.getByLabel('New folder name').fill('Archive')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await page.getByRole('button', { name: 'Move note Waffles' }).click()
  await page.getByLabel('Move Waffles to').selectOption('Archive')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(contents(page, 'Archive').getByRole('button', { name: 'Waffles', exact: true })).toBeVisible()
  await expect(contents(page, 'Recipes').getByRole('button', { name: 'Waffles', exact: true })).toHaveCount(0)

  // Rename the folder; the note goes with it.
  await page.getByRole('button', { name: 'Rename folder Archive' }).click()
  await page.getByLabel('New name for Archive').fill('Old stuff')
  await page.getByLabel('New name for Archive').press('Enter')
  await expect(contents(page, 'Old stuff').getByRole('button', { name: 'Waffles', exact: true })).toBeVisible()

  // Move the now-empty Recipes folder into Old stuff, then delete it.
  await page.getByRole('button', { name: 'Move folder Recipes' }).click()
  await page.getByLabel('Move Recipes to').selectOption('Old stuff')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(contents(page, 'Old stuff').getByRole('button', { name: 'Recipes', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete folder Recipes' }).click()
  await expect(page.getByRole('button', { name: 'Recipes', exact: true })).toHaveCount(0)

  // Everything survives a reload.
  await expect(page.getByRole('status')).toHaveText('All changes saved')
  await page.reload()
  await expect(contents(page, 'Old stuff').getByRole('button', { name: 'Waffles', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recipes', exact: true })).toHaveCount(0)
})
