import { onTestFinished } from 'vitest'
import { createCouchDbAuth, personalSpaceId, type AuthAdapter } from '../../src/core'

const couchUrl = new URL(process.env.COUCHDB_URL ?? 'http://admin:password@localhost:5984')
export const couchOrigin = couchUrl.origin

export interface Credentials {
  name: string
  password: string
}

/** The owner: the CouchDB server admin from COUCHDB_URL. */
export const ownerCredentials: Credentials = {
  name: decodeURIComponent(couchUrl.username),
  password: decodeURIComponent(couchUrl.password),
}

export function basicAuth({ name, password }: Credentials) {
  return `Basic ${btoa(`${name}:${password}`)}`
}

/** An auth adapter acting as the owner with HTTP basic auth (like a signed-in owner session). */
export function ownerAuth(): AuthAdapter {
  return createCouchDbAuth({
    url: couchOrigin,
    fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', basicAuth(ownerCredentials))
      return fetch(input, { ...init, headers })
    },
  })
}

/** A signed-out auth adapter with its own cookie jar, like a fresh browser. */
export function browserAuth(): AuthAdapter {
  let cookie: string | undefined
  return createCouchDbAuth({
    url: couchOrigin,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      if (cookie) headers.set('Cookie', cookie)
      const res = await fetch(input, { ...init, headers })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) {
        const pair = setCookie.split(';')[0] ?? ''
        cookie = pair.endsWith('=') ? undefined : pair
      }
      return res
    },
  })
}

/** Creates a user through the owner's adapter and removes it (and its personal space) after the test. */
export async function newUser(): Promise<Credentials> {
  const user = { name: `user-${crypto.randomUUID().slice(0, 8)}`, password: crypto.randomUUID() }
  onTestFinished(() => removeUser(user.name))
  await ownerAuth().createUser(user.name, user.password)
  return user
}

export async function removeUser(name: string) {
  const headers = { Authorization: basicAuth(ownerCredentials) }
  const url = `${couchOrigin}/_users/org.couchdb.user:${encodeURIComponent(name)}`
  const doc = await fetch(url, { headers })
  if (doc.ok) {
    const { _rev } = (await doc.json()) as { _rev: string }
    await fetch(`${url}?rev=${_rev}`, { method: 'DELETE', headers })
  }
  await fetch(`${couchOrigin}/${personalSpaceId(name)}`, { method: 'DELETE', headers })
}

/** Creates a shared space as the owner, adds `members`, and deletes the space after the test. */
export async function newSharedSpace(name = `Shared ${crypto.randomUUID().slice(0, 8)}`, members: Credentials[] = []) {
  const owner = ownerAuth()
  const space = await owner.createSharedSpace(name)
  onTestFinished(() => removeSharedSpace(space.id))
  for (const member of members) await owner.addMember(space.id, member.name)
  return space
}

export async function removeSharedSpace(id: string) {
  await fetch(`${couchOrigin}/${id}`, { method: 'DELETE', headers: { Authorization: basicAuth(ownerCredentials) } })
}

/** Waits (briefly) until CouchDB answers `status` when this user reads the space, and returns the final answer. */
export async function waitForAccess(spaceId: string, user: Credentials, status: number): Promise<number> {
  const read = async () => (await fetch(`${couchOrigin}/${spaceId}`, { headers: { Authorization: basicAuth(user) } })).status
  for (let i = 0; i < 50 && (await read()) !== status; i++) await new Promise((r) => setTimeout(r, 100))
  return read()
}
