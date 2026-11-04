import type { Page } from '@playwright/test'
import { expect, signIn, test } from './support/users'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Note body' })
const readingView = (page: Page) => page.getByRole('article', { name: 'Reading view' })
const toggle = (page: Page) => page.getByRole('button', { name: 'Reading view' })
const selectedNote = (page: Page) => page.locator('.row.note > [aria-current="true"]')

/** The source in the editor, line by line, exactly as stored. */
async function sourceText(page: Page): Promise<string> {
  return (await editor(page).locator('.cm-line').allTextContents()).join('\n')
}

/** Creates a note and puts `body` in it exactly, bypassing auto-closing brackets and indentation. */
async function createNote(page: Page, title: string, body = '') {
  await page.getByLabel('New note title').fill(title)
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(selectedNote(page)).toHaveText(title)
  if (body) {
    await editor(page).click()
    await page.keyboard.insertText(body)
    await expect(page.getByRole('status')).toHaveText('All changes saved')
  }
}

test.beforeEach(async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)
})

test('the reading view renders the note, its properties, and callouts, and switching back shows the source unchanged', async ({ page }) => {
  const body = '---\nwhere: Lisbon\ndays: 4\n---\n# Packing\n\n- **passport**\n\n> [!warning] Mind the gap\n> Trains are busy.\n'
  await createNote(page, 'Trip', body)

  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  const view = readingView(page)
  await expect(view.getByRole('heading', { name: 'Packing' })).toBeVisible()
  await expect(view.locator('strong')).toHaveText('passport')

  const properties = view.getByRole('list', { name: 'Properties' })
  await expect(properties).toContainText('where')
  await expect(properties).toContainText('Lisbon')
  await expect(properties).toContainText('days')

  const callout = view.locator('.callout[data-callout="warning"]')
  await expect(callout.locator('.callout-title')).toHaveText('Mind the gap')
  await expect(callout).toContainText('Trains are busy.')

  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  expect(await sourceText(page)).toBe(body)
})

test('Cmd+E on Apple devices, Ctrl+E elsewhere, switches between source and reading view', async ({ page }) => {
  await createNote(page, 'Plan', '# Today')
  await editor(page).click()
  const apple = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.userAgent))
  const shortcut = apple ? 'Meta+e' : 'Control+e'

  await page.keyboard.press(shortcut)
  await expect(readingView(page).getByRole('heading', { name: 'Today' })).toBeVisible()

  await page.keyboard.press(shortcut)
  await expect(editor(page)).toBeVisible()
})

test('wikilinks in the reading view open the linked note; unresolved links are shown but not clickable', async ({ page }) => {
  await createNote(page, 'Groceries', '# Groceries list')
  await createNote(page, 'Plan', 'Buy [[Groceries|the groceries]], then [[Nowhere]].')

  await toggle(page).click()
  const view = readingView(page)
  await expect(view.getByText('Nowhere')).toHaveClass(/unresolved/)
  await expect(view.getByRole('link', { name: 'Nowhere' })).toHaveCount(0)

  await view.getByRole('link', { name: 'the groceries' }).click()
  await expect(selectedNote(page)).toHaveText('Groceries')
  // The linked note opens in the reading view too.
  await expect(readingView(page).getByRole('heading', { name: 'Groceries list' })).toBeVisible()
})

test('embeds and block references show as written and are never changed', async ({ page }) => {
  const body = 'See ![[Groceries]] here\nA line ^abc123\nRef [[Groceries#^abc123]]'
  await createNote(page, 'Groceries')
  await createNote(page, 'Refs', body)

  await toggle(page).click()
  const view = readingView(page)
  await expect(view).toContainText('See ![[Groceries]] here')
  await expect(view).toContainText('A line ^abc123')
  await expect(view).toContainText('Ref [[Groceries#^abc123]]')

  await toggle(page).click()
  expect(await sourceText(page)).toBe(body)
})

test('HTML and script in a note are shown as text and never run', async ({ page }) => {
  const body = [
    '<script>window.__pwned = 1</script>',
    '',
    '<img src="x" onerror="window.__pwned = 2">',
    '',
    '[click me](javascript:window.__pwned=3)',
  ].join('\n')
  await createNote(page, 'Untrusted', body)

  await toggle(page).click()
  const view = readingView(page)
  await expect(view).toContainText('<script>window.__pwned = 1</script>')
  await expect(view).toContainText('<img src="x" onerror="window.__pwned = 2">')
  await expect(view.locator('img, script')).toHaveCount(0)
  await view.getByText('click me').click()

  // Give any injected handler a chance to run before checking.
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})
