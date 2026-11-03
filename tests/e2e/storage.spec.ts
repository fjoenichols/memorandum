import { expect, test, type Page } from '@playwright/test'

/** Makes the browser answer persistent-storage requests the way we choose. */
async function stubPersist(page: Page, answer: boolean | 'unsupported') {
  await page.addInitScript((answer) => {
    if (answer === 'unsupported') {
      Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
      return
    }
    const storage = navigator.storage
    const w = window as unknown as { persistRequests: number }
    w.persistRequests = 0
    storage.persisted = async () => false
    storage.persist = async () => {
      w.persistRequests++
      return answer
    }
  }, answer)
}

test('asks for persistent storage and shows no warning when granted', async ({ page }) => {
  await stubPersist(page, true)
  await page.goto('/')
  await expect(page.getByLabel('New note title')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { persistRequests: number }).persistRequests)).toBe(1)
  await expect(page.getByRole('complementary', { name: 'Storage warning' })).toHaveCount(0)
})

test('warns, without blocking, when persistent storage is denied', async ({ page }) => {
  await stubPersist(page, false)
  await page.goto('/')
  const warning = page.getByRole('complementary', { name: 'Storage warning' })
  await expect(warning).toContainText('may clear')

  // The app stays usable while the warning shows.
  await page.getByLabel('New note title').fill('Still works')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByRole('button', { name: 'Still works' })).toBeVisible()

  await warning.getByRole('button', { name: 'Dismiss' }).click()
  await expect(warning).toHaveCount(0)
})

test('warns when the browser has no persistent storage at all', async ({ page }) => {
  await stubPersist(page, 'unsupported')
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'Storage warning' })).toContainText('may clear')
})
