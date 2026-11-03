/**
 * The storage module: the only code that reads or writes update documents.
 * Per-document encryption would be added here later (see ADR-0002).
 *
 * Each edit batch to a note becomes a new, never-modified update document
 * keyed by note ID, device ID, and a per-device sequence, so CouchDB never
 * sees a revision conflict and Yjs does all the merging.
 */

import { mergeUpdates } from 'yjs'

export type LocalDatabase = PouchDB.Database
export type RemoteDatabase = PouchDB.Database

interface UpdateDoc {
  _id: string
  type: 'update'
  noteId: string
  deviceId: string
  seq: number
  data: string
}

interface QueuedWrite {
  noteId: string
  data: Uint8Array
  resolve: () => void
  reject: (err: unknown) => void
}

export type UpdateListener = (noteId: string, data: Uint8Array) => void

export class SpaceStorage {
  /** Highest sequence this device has used in this space, as far as we know. */
  private seq = 0
  private queue: QueuedWrite[] = []
  private writing?: Promise<void>
  private feed?: PouchDB.Core.Changes<object>
  private sync?: PouchDB.Replication.Sync<object>

  private constructor(
    private readonly local: LocalDatabase,
    private readonly openRemote: (() => RemoteDatabase) | undefined,
    private readonly deviceId: string,
    private readonly onUpdate: UpdateListener,
  ) {}

  /**
   * Opens a space's local database, replays every stored update into
   * `onUpdate`, then keeps calling it for updates that arrive later.
   */
  static async open(
    local: LocalDatabase,
    openRemote: (() => RemoteDatabase) | undefined,
    deviceId: string,
    onUpdate: UpdateListener,
  ): Promise<SpaceStorage> {
    const storage = new SpaceStorage(local, openRemote, deviceId, onUpdate)

    const initial = await local.changes({ since: 0, include_docs: true })
    for (const change of initial.results) storage.deliver(change.doc)

    storage.feed = local
      .changes({ since: initial.last_seq, live: true, include_docs: true })
      .on('change', (change) => storage.deliver(change.doc))
    return storage
  }

  /**
   * Appends one update for a note. Resolves once it is stored locally.
   * Updates queued while a write is in progress are merged into one update
   * per note and stored in one batch, so fast typing stays cheap to store
   * and sync.
   */
  append(noteId: string, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ noteId, data, resolve, reject })
      this.writing ??= this.drain()
    })
  }

  /** Starts or stops continuous two-way replication with the server. */
  setOnline(online: boolean) {
    if (online && !this.sync && this.openRemote) {
      // retry: true backs off and keeps retrying while the network is down.
      this.sync = this.local.sync(this.openRemote(), { live: true, retry: true })
    } else if (!online && this.sync) {
      this.sync.cancel()
      this.sync = undefined
    }
  }

  async close() {
    this.setOnline(false)
    this.feed?.cancel()
    await this.writing
    await this.local.close()
  }

  private async drain() {
    while (this.queue.length > 0) {
      const byNote = new Map<string, QueuedWrite[]>()
      for (const write of this.queue) byNote.set(write.noteId, [...(byNote.get(write.noteId) ?? []), write])
      this.queue = []

      const groups = [...byNote.values()]
      const docs = groups.map((writes) => this.updateDoc(writes))
      try {
        const results = await this.local.bulkDocs(docs)
        results.forEach((result, i) => {
          const writes = groups[i] ?? []
          if (!('error' in result)) {
            for (const write of writes) write.resolve()
          } else if (result.status === 409) {
            // The ID was already taken, e.g. this device's older updates
            // arrived from the server after local data was cleared. The
            // sequence has moved past it by now, so retry with a new one.
            this.queue.push(...writes)
          } else {
            for (const write of writes) write.reject(result)
          }
        })
      } catch (err) {
        for (const write of groups.flat()) write.reject(err)
      }
    }
    this.writing = undefined
  }

  /** One update document holding every queued update for a single note. */
  private updateDoc(writes: QueuedWrite[]): UpdateDoc {
    const [first] = writes
    if (!first) throw new Error('No writes to store')
    const data = writes.length === 1 ? first.data : mergeUpdates(writes.map((w) => w.data))
    const seq = ++this.seq
    return {
      _id: `u:${first.noteId}:${this.deviceId}:${String(seq).padStart(12, '0')}`,
      type: 'update',
      noteId: first.noteId,
      deviceId: this.deviceId,
      seq,
      data: toBase64(data),
    }
  }

  private deliver(doc: object | undefined) {
    if (!doc || (doc as Partial<UpdateDoc>).type !== 'update') return
    const update = doc as UpdateDoc
    // Never reuse a sequence this device has already used, even one we only
    // learn about from the server.
    if (update.deviceId === this.deviceId) this.seq = Math.max(this.seq, update.seq)
    this.onUpdate(update.noteId, fromBase64(update.data))
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
