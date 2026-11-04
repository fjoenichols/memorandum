import PouchDB from 'pouchdb-core'
import IdbAdapter from 'pouchdb-adapter-idb'
import HttpAdapter from 'pouchdb-adapter-http'
import Replication from 'pouchdb-replication'
import { createCore, type Core } from '.'
import { createCouchDbAuth, type AuthAdapter, type AuthUser, type SpaceRef } from './auth'

PouchDB.plugin(IdbAdapter).plugin(HttpAdapter).plugin(Replication)

const DEVICE_ID_KEY = 'memorandum.deviceId'
const USER_KEY = 'memorandum.user'
const SPACES_KEY = 'memorandum.spaces'

/** CouchDB, on the app's own origin (proxied by Vite in development and Caddy in production). */
export function couchUrl(): string {
  return `${location.origin}/couch`
}

/**
 * The core as configured in the browser: IndexedDB for local storage, synced
 * with CouchDB using the signed-in user's session cookie.
 */
export function createBrowserCore(remoteUrl: string | undefined = couchUrl()): Core {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return createCore({
    deviceId,
    openLocal: (name) => new PouchDB(name, { adapter: 'idb' }),
    openRemote: remoteUrl ? (name) => new PouchDB(`${remoteUrl}/${name}`, { skip_setup: true }) : undefined,
  })
}

export function createBrowserAuth(): AuthAdapter {
  return createCouchDbAuth({ url: couchUrl() })
}

/**
 * The last user signed in on this device, so the app can open their notes
 * when the server can't be reached (offline launch).
 */
export const rememberedUser = {
  get(): AuthUser | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as AuthUser | null
    } catch {
      return null
    }
  },
  set(user: AuthUser | null) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  },
}

/** The spaces a user could open last time we checked, so the switcher works offline. */
export const rememberedSpaces = {
  get(userName: string): SpaceRef[] | null {
    try {
      return JSON.parse(localStorage.getItem(`${SPACES_KEY}.${userName}`) ?? 'null') as SpaceRef[] | null
    } catch {
      return null
    }
  },
  set(userName: string, spaces: SpaceRef[]) {
    localStorage.setItem(`${SPACES_KEY}.${userName}`, JSON.stringify(spaces))
  },
}
