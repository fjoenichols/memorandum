import { Space } from './space'
import { SpaceStorage, type LocalDatabase, type RemoteDatabase } from './storage'

export type { BodyEdit, Note, NoteSummary } from './space'
export type { Space }

export interface CoreOptions {
  /** Stable ID for this device. */
  deviceId: string
  /** Opens (creating if needed) this device's local database with the given name. */
  openLocal: (name: string) => LocalDatabase
  /** Opens the server's database with the given name. Without it, spaces never sync. */
  openRemote?: (name: string) => RemoteDatabase
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
  const open = new Map<string, { space: Space; storage: SpaceStorage }>()
  let online = true

  return {
    async openSpace(spaceId) {
      const existing = open.get(spaceId)
      if (existing) return existing.space

      const space = new Space(spaceId)
      const storage = await SpaceStorage.open(
        options.openLocal(spaceId),
        openRemote ? () => openRemote(spaceId) : undefined,
        options.deviceId,
        (noteId, data) => space.receive(noteId, data),
      )
      space.attach(storage)
      storage.setOnline(online)
      open.set(spaceId, { space, storage })
      return space
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
