import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { buildVersion, startDeployServer } from './support/deploys'

let root: string
let v1: string
let v2: string

test.beforeAll(() => {
  test.setTimeout(180_000)
  root = mkdtempSync(join(tmpdir(), 'memorandum-deploys-'))
  v1 = join(root, 'v1')
  v2 = join(root, 'v2')
  buildVersion('v1', v1)
  buildVersion('v2', v2)
})

test.afterAll(() => rmSync(root, { recursive: true, force: true }))

const build = (page: Page) => page.evaluate(() => document.documentElement.dataset.build)
/** Survives only as long as the page isn't reloaded. */
const markPage = (page: Page) => page.evaluate(() => ((window as unknown as { marker: string }).marker = 'same page'))
const isSamePage = (page: Page) =>
  page.evaluate(() => (window as unknown as { marker?: string }).marker === 'same page')

/** Opens v1, waits until its service worker controls the page, then deploys v2 and checks for it. */
async function openThenDeploy(page: Page) {
  const server = await startDeployServer(v1)
  await page.goto(server.url)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  expect(await build(page)).toBe('v1')

  await markPage(page)
  server.deploy(v2)
  // Browsers check for a new service worker periodically and on navigation;
  // trigger that check now rather than waiting.
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
  return server
}

test('a new deploy shows "Update available" and the app keeps running until the user accepts', async ({ page }) => {
  const server = await openThenDeploy(page)
  try {
    const prompt = page.getByRole('complementary', { name: 'Update available' })
    await expect(prompt).toBeVisible({ timeout: 15_000 })
    expect(await isSamePage(page)).toBe(true)
    expect(await build(page)).toBe('v1')

    const reloaded = page.waitForEvent('load', { timeout: 15_000 })
    await prompt.getByRole('button', { name: 'Update now' }).click()
    await reloaded
    expect(await isSamePage(page)).toBe(false)
    expect(await build(page)).toBe('v2')
  } finally {
    await server.close()
  }
})

test('dismissing the update prompt never reloads the app', async ({ page }) => {
  const server = await openThenDeploy(page)
  try {
    const prompt = page.getByRole('complementary', { name: 'Update available' })
    await expect(prompt).toBeVisible({ timeout: 15_000 })

    await prompt.getByRole('button', { name: 'Later' }).click()
    await expect(prompt).toHaveCount(0)
    await page.waitForTimeout(2000)
    expect(await isSamePage(page)).toBe(true)
    expect(await build(page)).toBe('v1')
  } finally {
    await server.close()
  }
})
