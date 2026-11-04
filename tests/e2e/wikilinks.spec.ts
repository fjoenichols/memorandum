import { expect, test, type Page } from '@playwright/test'

async function createNote(page: Page, title: string, body = '') {
  await page.getByLabel('New note title').fill(title)
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(selectedNote(page)).toHaveText(title)
  if (body) {
    await page.getByRole('textbox', { name: 'Note body' }).click()
    await page.keyboard.type(body)
  }
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Note body' })

/** The note the sidebar marks as open. */
const selectedNote = (page: Page) => page.locator('.row.note > [aria-current="true"]')

test('typing [[ suggests titles from the space, and picking one inserts the link', async ({ page }) => {
  await page.goto('/')
  await createNote(page, 'Groceries', 'milk and eggs')
  await createNote(page, 'Garden plan')
  await createNote(page, 'Plan')

  await editor(page).click()
  await page.keyboard.type('Buy [[')
  const suggestions = page.getByRole('listbox')
  await expect(suggestions.getByRole('option', { name: /Groceries/ })).toBeVisible()
  await expect(suggestions.getByRole('option', { name: /Garden plan/ })).toBeVisible()

  await page.keyboard.type('Groc')
  await expect(suggestions.getByRole('option')).toHaveCount(1)
  await suggestions.getByRole('option', { name: /Groceries/ }).click()

  await expect(editor(page)).toHaveText('Buy [[Groceries]]')
  // The cursor lands after the link, so typing carries on outside it.
  await page.keyboard.type(' today')
  await expect(editor(page)).toHaveText('Buy [[Groceries]] today')
})

test('when a title repeats across folders, picking one inserts its folder path so the link stays exact', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('New folder name').fill('Recipes')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await createNote(page, 'Cake', 'chocolate')
  await page.getByRole('button', { name: 'Top level' }).click()
  await createNote(page, 'Cake', 'shopping-list cake')
  await createNote(page, 'Plan')

  await editor(page).click()
  await page.keyboard.type('[[Cak')
  await page.getByRole('listbox').getByRole('option', { name: /Cake.*Recipes/ }).click()
  await expect(editor(page)).toHaveText('[[Recipes/Cake]]')

  await page.getByRole('button', { name: 'Open Cake' }).click()
  await expect(editor(page)).toHaveText('chocolate')
})

test('tapping the open button on a link, or Ctrl/Cmd-clicking it, opens the linked note', async ({ page }) => {
  await page.goto('/')
  await createNote(page, 'Groceries', 'milk and eggs')
  await createNote(page, 'Plan', 'See [[groceries|the list]] and [[Nowhere]].')

  // A link to a missing note has no open button.
  await expect(page.getByRole('button', { name: 'Open Nowhere' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Open Groceries' }).click()
  await expect(selectedNote(page)).toHaveText('Groceries')
  await expect(editor(page)).toHaveText('milk and eggs')

  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await editor(page).getByText('groceries|the list').click({ modifiers: ['ControlOrMeta'] })
  await expect(selectedNote(page)).toHaveText('Groceries')
})

test('a plain click on a link places the cursor for editing instead of navigating', async ({ page }) => {
  await page.goto('/')
  await createNote(page, 'Groceries')
  await createNote(page, 'Plan', 'See [[Groceries]]')

  await editor(page).getByText('Groceries').click()
  await expect(selectedNote(page)).toHaveText('Plan')
})
