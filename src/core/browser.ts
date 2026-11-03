import PouchDB from 'pouchdb-core'
import IdbAdapter from 'pouchdb-adapter-idb'
import HttpAdapter from 'pouchdb-adapter-http'
import Replication from 'pouchdb-replication'
import { createCore, type Core } from '.'

PouchDB.plugin(IdbAdapter).plugin(HttpAdapter).plugin(Replication)

const DEVICE_ID_KEY = 'memorandum.deviceId'

/**
 * The core as configured in the browser: IndexedDB for local storage, and
 * sync to `remoteUrl` when one is given (sign-in and spaces come later).
 */
export function createBrowserCore(remoteUrl?: string): Core {
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
