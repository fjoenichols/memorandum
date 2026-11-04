import { expect, owner, removeUser, signIn, test, uniqueName } from './support/users'

test('sign in, write a note in the personal space, reload, and still be signed in', async ({ page, user }) => {
  await page.goto('/')
  await signIn(page, user)
  await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible()

  await page.getByLabel('New note title').fill('Mine')
  await page.getByRole('button', { name: 'Create note' }).click()
  await page.getByRole('textbox', { name: 'Note body' }).click()
  await page.keyboard.type('only for me')
  await expect(page.getByRole('status')).toHaveText('All changes saved')

  await page.reload()
  await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible()
  await page.getByRole('button', { name: 'Mine', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Note body' })).toContainText('only for me')
})

test("a note syncs to the same user's other device through the server", async ({ browser, user }) => {
  const laptop = await (await browser.newContext()).newPage()
  const phone = await (await browser.newContext()).newPage()
  await laptop.goto('/')
  await signIn(laptop, user)
  await laptop.getByLabel('New note title').fill('From the laptop')
  await laptop.getByRole('button', { name: 'Create note' }).click()

  await phone.goto('/')
  await signIn(phone, user)
  await expect(phone.getByRole('button', { name: 'From the laptop', exact: true })).toBeVisible({ timeout: 15_000 })
})

test('a signed-in user can open their notes with no network', async ({ page, context, user }) => {
  await page.goto('/')
  await signIn(page, user)
  await page.getByLabel('New note title').fill('Offline copy')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByRole('status')).toHaveText('All changes saved')
  // Let the service worker take control so the app shell loads offline.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(`Signed in as ${user.name}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offline copy', exact: true })).toBeVisible()
})

test('a wrong password shows an error and stays on the sign-in screen', async ({ page, user }) => {
  await page.goto('/')
  await page.getByLabel('User name', { exact: true }).fill(user.name)
  await page.getByLabel('Password', { exact: true }).fill('not the password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Wrong user name or password')
  await expect(page.getByLabel('New note title')).toHaveCount(0)
})

test('after signing out, the next user sees only their own notes', async ({ page, user, otherUser }) => {
  await page.goto('/')
  await signIn(page, user)
  await page.getByLabel('New note title').fill('Private to the first user')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByRole('status')).toHaveText('All changes saved')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  await signIn(page, otherUser)
  await expect(page.getByText(`Signed in as ${otherUser.name}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Private to the first user', exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText(`Signed in as ${otherUser.name}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Private to the first user', exact: true })).toHaveCount(0)
})

test('the owner can create a user, who can then sign in', async ({ page }) => {
  const newUser = { name: uniqueName(), password: crypto.randomUUID() }
  test.info().attach('user', { body: newUser.name })
  try {
    await page.goto('/')
    await signIn(page, owner)
    await page.getByText('Create a user').click()
    await page.getByLabel('New user name').fill(newUser.name)
    await page.getByLabel('New user password').fill(newUser.password)
    await page.getByRole('button', { name: 'Create user' }).click()
    await expect(page.getByText(`Created ${newUser.name}`)).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, newUser)
    await expect(page.getByText(`Signed in as ${newUser.name}`)).toBeVisible()
    // Regular users can't create accounts, so they don't see the form.
    await expect(page.getByText('Create a user')).toHaveCount(0)
  } finally {
    await removeUser(newUser.name)
  }
})
