import { expect, test as base, type Page } from '@playwright/test'
import { createCouchDbAuth, personalSpaceId } from '../../../src/core/auth'

const couchUrl = new URL(process.env.COUCHDB_URL ?? 'http://admin:password@localhost:5984')

export interface Credentials {
  name: string
  password: string
}

/** The owner: the CouchDB server admin. */
export const owner: Credentials = {
  name: decodeURIComponent(couchUrl.username),
  password: decodeURIComponent(couchUrl.password),
}

const adminHeader = `Basic ${btoa(`${owner.name}:${owner.password}`)}`

const ownerAuth = createCouchDbAuth({
  url: couchUrl.origin,
  fetch: (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', adminHeader)
    return fetch(input, { ...init, headers })
  },
})

export function uniqueName() {
  return `user-${crypto.randomUUID().slice(0, 8)}`
}

/** Deletes a user and their personal space. */
export async function removeUser(name: string) {
  const headers = { Authorization: adminHeader }
  const url = `${couchUrl.origin}/_users/org.couchdb.user:${encodeURIComponent(name)}`
  const doc = await fetch(url, { headers })
  if (doc.ok) {
    const { _rev } = (await doc.json()) as { _rev: string }
    await fetch(`${url}?rev=${_rev}`, { method: 'DELETE', headers })
  }
  await fetch(`${couchUrl.origin}/${personalSpaceId(name)}`, { method: 'DELETE', headers })
}

/** Signs in through the sign-in screen and waits for the notes screen. */
export async function signIn(page: Page, { name, password }: Credentials) {
  await page.getByLabel('User name', { exact: true }).fill(name)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('New note title')).toBeVisible()
}

/** Tests get fresh users (created by the owner, removed afterwards). */
export const test = base.extend<{ user: Credentials; otherUser: Credentials }>({
  // eslint-disable-next-line no-empty-pattern
  user: async ({}, use) => {
    const user = { name: uniqueName(), password: crypto.randomUUID() }
    await ownerAuth.createUser(user.name, user.password)
    await use(user)
    await removeUser(user.name)
  },
  // eslint-disable-next-line no-empty-pattern
  otherUser: async ({}, use) => {
    const user = { name: uniqueName(), password: crypto.randomUUID() }
    await ownerAuth.createUser(user.name, user.password)
    await use(user)
    await removeUser(user.name)
  },
})

export { expect }
