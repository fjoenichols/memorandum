/**
 * Authentication. All sign-in, session, and account work goes through an
 * AuthAdapter, so another identity provider can be added later as a new
 * adapter (plus CouchDB's JWT auth) without touching the rest of the app.
 */

export interface AuthUser {
  name: string
  /** The owner runs the app: the CouchDB server admin. */
  isOwner: boolean
  /** The ID of the user's personal space. */
  personalSpaceId: string
}

export interface AuthAdapter {
  /** The signed-in user, or null. Throws if the server can't be reached. */
  currentUser(): Promise<AuthUser | null>
  /** Signs in and starts a session. Throws SignInError for a wrong name or password. */
  signIn(name: string, password: string): Promise<AuthUser>
  signOut(): Promise<void>
  /** Owner only: creates a user and their personal space. */
  createUser(name: string, password: string): Promise<void>
}

export class SignInError extends Error {
  constructor() {
    super('Wrong user name or password')
    this.name = 'SignInError'
  }
}

/**
 * The personal space for a user: `userdb-` plus the user name's UTF-8 bytes
 * in hex, which is always a valid CouchDB database name and is the same
 * naming CouchDB's own per-user databases use.
 */
export function personalSpaceId(userName: string): string {
  const hex = [...new TextEncoder().encode(userName)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `userdb-${hex}`
}

export interface CouchDbAuthOptions {
  /** CouchDB base URL, e.g. `${location.origin}/couch`. */
  url: string
  /** Defaults to the global fetch, sending cookies. */
  fetch?: typeof fetch
}

interface SessionResponse {
  userCtx: { name: string | null; roles: string[] }
}

/** Auth backed by CouchDB's built-in users (`_users`) and session cookies (`_session`). */
export function createCouchDbAuth({ url, fetch: send = (input, init) => fetch(input, init) }: CouchDbAuthOptions): AuthAdapter {
  const request = (path: string, init: RequestInit = {}) =>
    send(`${url}${path}`, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    })

  const toUser = (name: string, roles: string[]): AuthUser => ({
    name,
    isOwner: roles.includes('_admin'),
    personalSpaceId: personalSpaceId(name),
  })

  async function expectOk(res: Response, what: string) {
    if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`)
  }

  /** Creates the space's database (if missing) with `name` as its only member. Needs the owner's rights. */
  async function createPersonalSpace(name: string) {
    const db = `/${personalSpaceId(name)}`
    const created = await request(db, { method: 'PUT' })
    if (!created.ok && created.status !== 412) await expectOk(created, `Creating the personal space for ${name}`)
    const security = await request(`${db}/_security`, {
      method: 'PUT',
      body: JSON.stringify({ admins: { names: [], roles: [] }, members: { names: [name], roles: [] } }),
    })
    await expectOk(security, `Securing the personal space for ${name}`)
  }

  return {
    async currentUser() {
      const res = await request('/_session')
      await expectOk(res, 'Checking the session')
      const { userCtx } = (await res.json()) as SessionResponse
      return userCtx.name ? toUser(userCtx.name, userCtx.roles) : null
    },

    async signIn(name, password) {
      const res = await request('/_session', { method: 'POST', body: JSON.stringify({ name, password }) })
      if (res.status === 401) throw new SignInError()
      await expectOk(res, 'Signing in')
      const { roles } = (await res.json()) as { roles: string[] }
      const user = toUser(name, roles)
      // The owner isn't in _users, so their personal space is made on first sign-in.
      if (user.isOwner) await createPersonalSpace(name)
      return user
    },

    async signOut() {
      await expectOk(await request('/_session', { method: 'DELETE' }), 'Signing out')
    },

    async createUser(name, password) {
      const userName = name.trim()
      if (!userName || userName.startsWith('_') || userName.includes(':')) {
        throw new Error('User names must not be empty, start with "_", or contain ":"')
      }
      if (!password) throw new Error('A password is required')
      const res = await request(`/_users/org.couchdb.user:${encodeURIComponent(userName)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: userName, password, roles: [], type: 'user' }),
      })
      if (res.status === 401 || res.status === 403) throw new Error('Only the owner can create users')
      if (res.status === 409) throw new Error(`A user named "${userName}" already exists`)
      await expectOk(res, `Creating user ${userName}`)
      await createPersonalSpace(userName)
    },
  }
}
