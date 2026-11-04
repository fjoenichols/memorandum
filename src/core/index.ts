import { Space } from './space'
import { SpaceStorage, type LocalDatabase, type RemoteDatabase } from './storage'

export type { BodyEdit, Note, NoteSummary, TrashedNote } from './space'
export { TRASH_RETENTION_MS } from './space'
export type { SnapshotInfo } from './storage'
export type { Space }

const DEFAULT_SNAPSHOT_EVERY = 100
const PURGE_CHECK_MS = 60 * 60 * 1000

export interface CoreOptions {
  /** Stable ID for this device. */
  deviceId: string
  /** Opens (creating if needed) this device's local database with the given name. */
  openLocal: (name: string) => LocalDatabase
  /** Opens the server's database with the given name. Without it, spaces never sync. */
  openRemote?: (name: string) => RemoteDatabase
  /**
   * Write a snapshot of a note once this many of its update documents aren't
   * covered by one yet (default 100). `Infinity` turns automatic snapshots off.
   */
  snapshotEvery?: number
  /** The clock for creation, deletion, and purge times (default `Date.now`; injectable for tests). */
  now?: () => number
}

/** The core API: the only way the UI and feature modules reach notes. */
export interface Core {
  openSpace(spaceId: string): Promise<Space>
  /** Starts or stops sync for every open space. Devices start online. */
  setOnline(online: boolean): void
  close(): Promise<void>
}

export function createCore(options: CoreOptions): Core {
  const { openRemote } = options
  const open = new Map<string, { space: Space; storage: SpaceStorage; purgeTimer: ReturnType<typeof setInterval> }>()
  let online = true

  return {
    async openSpace(spaceId) {
      const existing = open.get(spaceId)
      if (existing) return existing.space

      const space = new Space(spaceId, options.now)
      const storage = await SpaceStorage.open(
        options.openLocal(spaceId),
        openRemote ? () => openRemote(spaceId) : undefined,
        { deviceId: options.deviceId, snapshotEvery: options.snapshotEvery ?? DEFAULT_SNAPSHOT_EVERY },
        {
          onUpdate: (noteId, data) => space.receive(noteId, data),
          encodeNote: (noteId) => space.encodeState(noteId),
        },
      )
      space.attach(storage)
      storage.setOnline(online)
      // Every device purges notes that have been in the trash 30 days, on open
      // and hourly after. Purging twice is harmless, so no device is special.
      await space.purgeExpired().catch(() => {})
      const purgeTimer = setInterval(() => void space.purgeExpired().catch(() => {}), PURGE_CHECK_MS)
      open.set(spaceId, { space, storage, purgeTimer })
      return space
    },

    setOnline(value) {
      online = value
      for (const { storage } of open.values()) storage.setOnline(value)
    },

    async close() {
      for (const { storage, purgeTimer } of open.values()) {
        clearInterval(purgeTimer)
        await storage.close()
      }
      open.clear()
    },
  }
}

export { noteEditorState } from './editor'
export { createCouchDbAuth, personalSpaceId, SignInError } from './auth'
export type { AuthAdapter, AuthUser, CouchDbAuthOptions } from './auth'
