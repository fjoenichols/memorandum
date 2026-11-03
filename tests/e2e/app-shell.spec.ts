import { expect, test } from '@playwright/test'

test('the app shell launches with no network after a first visit', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Memorandum' })).toBeVisible()

  // Wait for the service worker to finish caching the shell. It doesn't claim
  // the page that installed it (updates wait for the user), so it only
  // controls the next load.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Memorandum' })).toBeVisible()
})

test('the app is installable', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  if (!href) throw new Error('No <link rel="manifest"> on the page')

  const manifest = await (await request.get(href)).json()
  expect(manifest).toMatchObject({ name: 'Memorandum', start_url: '/', display: 'standalone' })
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))

  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src)
    expect(res.ok(), icon.src).toBe(true)
    expect(res.headers()['content-type']).toBe('image/png')
  }

  const hasServiceWorker = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)
  expect(hasServiceWorker).toBe(true)
})
