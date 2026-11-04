import { Space } from './space'
import { SpaceStorage, type LocalDatabase, type RemoteDatabase } from './storage'

export type { BodyEdit, Note, NoteSummary } from './space'
export type { SnapshotInfo } from './storage'
export type { Space }

const DEFAULT_SNAPSHOT_EVERY = 100

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
}

/** The core API: the only way the UI and feature modules reach notes. */
export interface Core {
  openSpace(spaceId: string): Promise<Space>
  /**
   * Stops syncing a space and closes it on this device. Its notes stay in
   * local storage; opening it again picks up where it left off.
   */
  closeSpace(spaceId: string): Promise<void>
  /** Starts or stops sync for every open space. Devices start online. */
  setOnline(online: boolean): void
  close(): Promise<void>
}

export function createCore(options: CoreOptions): Core {
  const { openRemote } = options
  const open = new Map<string, { space: Space; storage: SpaceStorage }>()
  /** Spaces being opened right now, so a second openSpace waits for the first. */
  const opening = new Map<string, Promise<Space>>()
  let online = true

  async function openNew(spaceId: string): Promise<Space> {
    const space = new Space(spaceId)
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
    open.set(spaceId, { space, storage })
    return space
  }

  return {
    openSpace(spaceId) {
      const existing = open.get(spaceId)
      if (existing) return Promise.resolve(existing.space)
      let pending = opening.get(spaceId)
      if (!pending) {
        pending = openNew(spaceId).finally(() => opening.delete(spaceId))
        opening.set(spaceId, pending)
      }
      return pending
    },

    async closeSpace(spaceId) {
      await opening.get(spaceId)?.catch(() => {})
      const entry = open.get(spaceId)
      if (!entry) return
      open.delete(spaceId)
      await entry.storage.close()
    },

    setOnline(value) {
      online = value
      for (const { storage } of open.values()) storage.setOnline(value)
    },

    async close() {
      for (const { storage } of open.values()) await storage.close()
      open.clear()
    },
  }
}

export { noteEditorState } from './editor'
export { createCouchDbAuth, personalSpaceId, SignInError } from './auth'
export type { AuthAdapter, AuthUser, CouchDbAuthOptions, SharedSpaceInfo, SpaceRef } from './auth'
