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
  /** IDs of the shared spaces the user is a member of. The owner can open every shared space. */
  sharedSpaceIds: string[]
}

/** A space as the switcher shows it. */
export interface SpaceRef {
  id: string
  name: string
  kind: 'personal' | 'shared'
}

/** A shared space as the owner manages it. */
export interface SharedSpaceInfo {
  id: string
  name: string
  /** Member user names, sorted. */
  members: string[]
}

/**
 * Sign-in, accounts, and space membership. Membership is an identity
 * concern: each shared space admits one role, and a user is a member when
 * they hold it, so an external identity provider can grant the same roles.
 */
export interface AuthAdapter {
  /** The signed-in user, or null. Throws if the server can't be reached. */
  currentUser(): Promise<AuthUser | null>
  /** Signs in and starts a session. Throws SignInError for a wrong name or password. */
  signIn(name: string, password: string): Promise<AuthUser>
  signOut(): Promise<void>
  /** Owner only: creates a user and their personal space. */
  createUser(name: string, password: string): Promise<void>
  /** Every space the user can open: their personal space first, then shared spaces by name. */
  spacesOf(user: AuthUser): Promise<SpaceRef[]>
  /** Owner only: creates a shared space with no members yet. */
  createSharedSpace(name: string): Promise<SharedSpaceInfo>
  /** Owner only: every shared space with its members. */
  listSharedSpaces(): Promise<SharedSpaceInfo[]>
  /** Owner only: every user name, sorted. */
  listUsers(): Promise<string[]>
  /** Owner only: makes a user a member of a shared space. Adding an existing member does nothing. */
  addMember(spaceId: string, userName: string): Promise<void>
  /** Owner only: removes a user from a shared space. Their devices lose access within moments. */
  removeMember(spaceId: string, userName: string): Promise<void>
}

const SHARED_PREFIX = 'shared-'
const MEMBER_ROLE_PREFIX = 'space:'

/** The role that admits members to a shared space. */
function memberRole(spaceId: string) {
  return `${MEMBER_ROLE_PREFIX}${spaceId}`
}

function isSharedSpaceId(id: string) {
  return id.startsWith(SHARED_PREFIX)
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
    sharedSpaceIds: roles
      .filter((role) => role.startsWith(MEMBER_ROLE_PREFIX))
      .map((role) => role.slice(MEMBER_ROLE_PREFIX.length))
      .filter(isSharedSpaceId)
      .sort(),
  })

  async function expectOk(res: Response, what: string) {
    if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`)
  }

  /** Like expectOk, but a refusal means the signed-in user isn't the owner. */
  async function expectOwnerOk(res: Response, what: string) {
    if (res.status === 401 || res.status === 403) throw new Error(`Only the owner can ${what}`)
    await expectOk(res, what)
  }

  interface SecurityDoc {
    members?: { names?: string[]; roles?: string[] }
    memorandum?: { name?: string }
  }

  /** A shared space's name, which lives in its security settings so every member can read it. */
  async function sharedSpaceName(id: string): Promise<string | null> {
    const res = await request(`/${id}/_security`)
    // Not (or no longer) a member, or the space is gone.
    if (res.status === 401 || res.status === 403 || res.status === 404) return null
    await expectOk(res, 'Reading a shared space')
    const security = (await res.json()) as SecurityDoc
    return security.memorandum?.name ?? 'Shared space'
  }

  interface UserDoc {
    _id: string
    _rev: string
    name: string
    roles: string[]
    type: 'user'
  }

  /** Adds or removes a role on a user's account (owner only), retrying if the account changed meanwhile. */
  async function changeRoles(userName: string, change: (roles: string[]) => string[]) {
    const path = `/_users/org.couchdb.user:${encodeURIComponent(userName)}`
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await request(path)
      if (res.status === 404) throw new Error(`There's no user named "${userName}"`)
      await expectOwnerOk(res, 'change members')
      const user = (await res.json()) as UserDoc
      const roles = change(user.roles)
      if (roles.length === user.roles.length && roles.every((r, i) => r === user.roles[i])) return
      const saved = await request(path, { method: 'PUT', body: JSON.stringify({ ...user, roles }) })
      if (saved.status === 409) continue
      await expectOwnerOk(saved, 'change members')
      return
    }
    throw new Error(`Couldn't update ${userName}'s spaces; try again`)
  }

  async function existingSharedSpace(id: string) {
    if (!isSharedSpaceId(id)) throw new Error(`"${id}" isn't a shared space`)
    const res = await request(`/${id}/_security`)
    if (res.status === 404) throw new Error(`There's no shared space "${id}"`)
    await expectOwnerOk(res, 'change members')
  }

  async function listSharedSpaces(): Promise<SharedSpaceInfo[]> {
    const dbs = await request('/_all_dbs')
    await expectOwnerOk(dbs, 'list shared spaces')
    const ids = ((await dbs.json()) as string[]).filter(isSharedSpaceId)

    const users = await request('/_users/_all_docs?include_docs=true')
    await expectOwnerOk(users, 'list shared spaces')
    const { rows } = (await users.json()) as { rows: { doc?: Partial<UserDoc> }[] }
    const membersOf = (id: string) =>
      rows
        .map((row) => row.doc)
        .filter((doc): doc is UserDoc => doc?.type === 'user' && (doc.roles ?? []).includes(memberRole(id)))
        .map((doc) => doc.name)
        .sort()

    const spaces = await Promise.all(
      ids.map(async (id) => {
        const name = await sharedSpaceName(id)
        return name === null ? null : { id, name, members: membersOf(id) }
      }),
    )
    return spaces.filter((s): s is SharedSpaceInfo => s !== null).sort(byName)
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

    async spacesOf(user) {
      const personal: SpaceRef = { id: user.personalSpaceId, name: 'Personal', kind: 'personal' }
      const shared = user.isOwner
        ? (await listSharedSpaces()).map(({ id, name }) => ({ id, name }))
        : (await Promise.all(user.sharedSpaceIds.map(async (id) => ({ id, name: await sharedSpaceName(id) })))).filter(
            (s): s is { id: string; name: string } => s.name !== null,
          )
      return [personal, ...shared.sort(byName).map((s) => ({ ...s, kind: 'shared' as const }))]
    },

    async createSharedSpace(name) {
      const spaceName = name.trim()
      if (!spaceName) throw new Error('A shared space needs a name')
      const bytes = crypto.getRandomValues(new Uint8Array(8))
      const id = `${SHARED_PREFIX}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
      await expectOwnerOk(await request(`/${id}`, { method: 'PUT' }), 'create shared spaces')
      const security = {
        admins: { names: [], roles: [] },
        // Members are whoever holds the space's role; the name rides along so members can read it.
        members: { names: [], roles: [memberRole(id)] },
        memorandum: { name: spaceName },
      }
      await expectOwnerOk(
        await request(`/${id}/_security`, { method: 'PUT', body: JSON.stringify(security) }),
        'create shared spaces',
      )
      return { id, name: spaceName, members: [] }
    },

    listSharedSpaces,

    async listUsers() {
      const res = await request('/_users/_all_docs?include_docs=true')
      await expectOwnerOk(res, 'list users')
      const { rows } = (await res.json()) as { rows: { doc?: Partial<UserDoc> }[] }
      return rows
        .map((row) => row.doc)
        .filter((doc): doc is UserDoc => doc?.type === 'user')
        .map((doc) => doc.name)
        .sort()
    },

    async addMember(spaceId, userName) {
      await existingSharedSpace(spaceId)
      const role = memberRole(spaceId)
      await changeRoles(userName, (roles) => (roles.includes(role) ? roles : [...roles, role]))
    },

    async removeMember(spaceId, userName) {
      const role = memberRole(spaceId)
      await changeRoles(userName, (roles) => roles.filter((r) => r !== role))
    },
  }
}

function byName(a: { id: string; name: string }, b: { id: string; name: string }) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}
