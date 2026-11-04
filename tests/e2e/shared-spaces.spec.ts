import type { Browser, Page } from '@playwright/test'
import {
  createSharedSpace,
  expect,
  owner,
  removeMember,
  removeSharedSpacesNamed,
  signIn,
  spaceSwitcher,
  test,
  type Credentials,
} from './support/users'

async function signedInPage(browser: Browser, who: Credentials): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await signIn(page, who)
  return page
}

async function createNote(page: Page, title: string) {
  await page.getByLabel('New note title').fill(title)
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('All changes saved')
}

const spaceName = () => `Family ${crypto.randomUUID().slice(0, 8)}`

test('the owner creates a shared space and adds members, who switch to it and share its notes', async ({
  browser,
  user,
  otherUser,
}) => {
  const name = spaceName()
  test.info().attach('space', { body: name })
  try {
    const ownerPage = await signedInPage(browser, owner)
    const panel = ownerPage.getByRole('region', { name: 'Shared spaces' })
    await ownerPage.getByText('Shared spaces', { exact: true }).click()
    await panel.getByLabel('New shared space name').fill(name)
    await panel.getByRole('button', { name: 'Create shared space' }).click()
    const space = panel.getByRole('listitem').filter({ hasText: name })
    for (const member of [user, otherUser]) {
      await space.getByLabel(`Add a member to ${name}`).selectOption(member.name)
      await space.getByRole('button', { name: 'Add member' }).click()
      await expect(space.getByRole('listitem').filter({ hasText: member.name })).toBeVisible()
    }

    const alice = await signedInPage(browser, user)
    await spaceSwitcher(alice).selectOption({ label: name })
    await createNote(alice, 'Plan the trip')

    const bob = await signedInPage(browser, otherUser)
    await spaceSwitcher(bob).selectOption({ label: name })
    await expect(bob.getByRole('button', { name: 'Plan the trip', exact: true })).toBeVisible({ timeout: 15_000 })

    // Shared notes stay in their space.
    await spaceSwitcher(bob).selectOption({ label: 'Personal' })
    await expect(bob.getByRole('button', { name: 'Plan the trip', exact: true })).toHaveCount(0)
  } finally {
    await removeSharedSpacesNamed(name)
  }
})

test('a device keeps syncing a shared space while showing another one', async ({ browser, user, otherUser }) => {
  const name = spaceName()
  await createSharedSpace(name, [user, otherUser])
  try {
    const alice = await signedInPage(browser, user)
    await expect(spaceSwitcher(alice)).toHaveValue(/userdb-/) // still on the personal space

    const bob = await signedInPage(browser, otherUser)
    await spaceSwitcher(bob).selectOption({ label: name })
    await createNote(bob, 'While you looked away')

    // Give Alice's device time to pull the note in the background, then cut
    // the network: the note can only be there if it synced while hidden.
    await alice.waitForTimeout(3000)
    await alice.context().setOffline(true)
    await spaceSwitcher(alice).selectOption({ label: name })
    await expect(alice.getByRole('button', { name: 'While you looked away', exact: true })).toBeVisible()
  } finally {
    await removeSharedSpacesNamed(name)
  }
})

test('a removed member no longer sees the space', async ({ browser, user }) => {
  const name = spaceName()
  const id = await createSharedSpace(name, [user])
  try {
    const alice = await signedInPage(browser, user)
    await expect(spaceSwitcher(alice).getByRole('option', { name })).toHaveCount(1)

    await removeMember(id, user)
    await alice.reload()
    await expect(alice.getByLabel('New note title')).toBeVisible()
    await expect(spaceSwitcher(alice).getByRole('option', { name })).toHaveCount(0)
    await expect(spaceSwitcher(alice)).toHaveValue(/userdb-/)
  } finally {
    await removeSharedSpacesNamed(name)
  }
})
