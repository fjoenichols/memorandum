/**
 * The storage module: the only code that reads or writes update and snapshot
 * documents. Per-document encryption would be added here later (see ADR-0002).
 *
 * Each edit batch to a note becomes a new, never-modified update document
 * keyed by note ID, device ID, and a per-device sequence, so CouchDB never
 * sees a revision conflict and Yjs does all the merging.
 *
 * Snapshots: once a note has piled up enough update documents, the device
 * that wrote the latest one stores a snapshot document holding the note's
 * merged state and the exact update revisions it covers, then deletes those
 * update documents (compaction). Snapshots are never modified or deleted, so
 * they can back version history later. Compaction is safe for devices that
 * are offline: it only deletes updates whose content is in a stored snapshot,
 * and an offline device's own updates aren't covered until a snapshot that
 * includes them exists.
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

interface SnapshotDoc {
  _id: string
  type: 'snapshot'
  noteId: string
  deviceId: string
  seq: number
  createdAt: number
  /** IDs of the update documents whose content `data` includes. */
  covers: string[]
  data: string
}

/** A stored snapshot of a note, newest last in `listSnapshots`. */
export interface SnapshotInfo {
  id: string
  deviceId: string
  createdAt: number
}

interface QueuedWrite {
  noteId: string
  data: Uint8Array
  resolve: () => void
  reject: (err: unknown) => void
}

type StoredDoc = Partial<UpdateDoc | SnapshotDoc> & { _id: string; _rev: string; _deleted?: boolean }

export interface StorageCallbacks {
  /** Applies an update or snapshot read from storage to a note. */
  onUpdate: (noteId: string, data: Uint8Array) => void
  /** The note's full current state, used as snapshot content. */
  encodeNote: (noteId: string) => Uint8Array
}

export interface StorageOptions {
  deviceId: string
  /** Snapshot a note once it has this many uncovered update documents. */
  snapshotEvery: number
}

export class SpaceStorage {
  /** Highest sequence this device has used in this space, as far as we know. */
  private seq = 0
  private queue: QueuedWrite[] = []
  private writing?: Promise<void>
  private feed?: PouchDB.Core.Changes<object>
  private sync?: PouchDB.Replication.Sync<object>
  private closed = false

  /** Update documents present on this device whose content has been applied, by note: ID → revision. */
  private readonly updates = new Map<string, Map<string, string>>()
  /** Update IDs whose content is in some snapshot, until their deletion arrives. */
  private readonly covered = new Set<string>()
  private readonly snapshots = new Map<string, SnapshotInfo[]>()
  private readonly compacting = new Map<string, Promise<void>>()
  private readonly scheduled = new Set<string>()

  private constructor(
    private readonly local: LocalDatabase,
    private readonly openRemote: (() => RemoteDatabase) | undefined,
    private readonly options: StorageOptions,
    private readonly callbacks: StorageCallbacks,
  ) {}

  /**
   * Opens a space's local database, replays every stored snapshot and update
   * into `onUpdate`, then keeps calling it for ones that arrive later.
   */
  static async open(
    local: LocalDatabase,
    openRemote: (() => RemoteDatabase) | undefined,
    options: StorageOptions,
    callbacks: StorageCallbacks,
  ): Promise<SpaceStorage> {
    const storage = new SpaceStorage(local, openRemote, options, callbacks)

    const initial = await local.changes({ since: 0, include_docs: true })
    for (const change of initial.results) storage.deliver(change.doc as StoredDoc | undefined)

    storage.feed = local
      .changes({ since: initial.last_seq, live: true, include_docs: true })
      .on('change', (change) => storage.deliver(change.doc as StoredDoc | undefined))
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

  /** Snapshots and compacts every note that has updates not yet in a snapshot. */
  async compactAll(): Promise<void> {
    const notes = [...this.updates.keys()].filter((noteId) => this.uncoveredCount(noteId) > 0)
    await Promise.all(notes.map((noteId) => this.compact(noteId)))
  }

  /** Snapshots stored for a note, oldest first. */
  listSnapshots(noteId: string): SnapshotInfo[] {
    return [...(this.snapshots.get(noteId) ?? [])].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  /** Number of update documents for a note currently stored on this device. */
  updateCount(noteId: string): number {
    return this.updates.get(noteId)?.size ?? 0
  }

  /** Starts or stops continuous two-way replication with the server. */
  setOnline(online: boolean) {
    if (online && !this.sync && this.openRemote) {
      // retry: true backs off and keeps retrying while the network is down.
      this.sync = this.local
        .sync(this.openRemote(), { live: true, retry: true })
        // Errors that stop sync (no access, expired session) must not crash
        // the app; the notes stay usable locally. Showing them is the
        // sync-status ticket's job.
        .on('error', () => {
          this.sync = undefined
        })
    } else if (!online && this.sync) {
      this.sync.cancel()
      this.sync = undefined
    }
  }

  async close() {
    this.closed = true
    this.setOnline(false)
    this.feed?.cancel()
    await this.writing
    await Promise.all(this.compacting.values())
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
            // The content came from the in-memory note, so it's already
            // applied there; record it now so the next snapshot covers it.
            const doc = docs[i]
            if (doc && result.rev) this.recordUpdate(doc.noteId, doc._id, result.rev)
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
      _id: docId('u', first.noteId, this.options.deviceId, seq),
      type: 'update',
      noteId: first.noteId,
      deviceId: this.options.deviceId,
      seq,
      data: toBase64(data),
    }
  }

  /** Snapshots one note, then deletes the update documents the snapshot covers. */
  private compact(noteId: string): Promise<void> {
    const running = this.compacting.get(noteId)
    if (running) return running

    // Read the covered revisions and the note's state together, with no
    // await in between, so the snapshot holds every update it claims to cover.
    const covers = new Map(this.updates.get(noteId))
    const data = this.callbacks.encodeNote(noteId)
    const seq = ++this.seq
    const snapshot: SnapshotDoc = {
      _id: docId('s', noteId, this.options.deviceId, seq),
      type: 'snapshot',
      noteId,
      deviceId: this.options.deviceId,
      seq,
      createdAt: Date.now(),
      covers: [...covers.keys()],
      data: toBase64(data),
    }

    const work = (async () => {
      // The snapshot is stored (and so replicates) before any deletion.
      await this.local.put(snapshot)
      // Delete exactly the revisions whose content the snapshot holds. If a
      // document has since changed or was already deleted, the write
      // conflicts and the document is left alone.
      await this.local.bulkDocs([...covers].map(([_id, _rev]) => ({ _id, _rev, _deleted: true })))
    })().finally(() => this.compacting.delete(noteId))
    this.compacting.set(noteId, work)
    return work
  }

  private uncoveredCount(noteId: string): number {
    let count = 0
    for (const id of this.updates.get(noteId)?.keys() ?? []) if (!this.covered.has(id)) count++
    return count
  }

  /** Snapshots a note soon if this device's own writes pushed it over the threshold. */
  private maybeScheduleSnapshot(noteId: string) {
    if (this.scheduled.has(noteId) || this.uncoveredCount(noteId) < this.options.snapshotEvery) return
    this.scheduled.add(noteId)
    setTimeout(() => {
      this.scheduled.delete(noteId)
      if (!this.closed && this.uncoveredCount(noteId) >= this.options.snapshotEvery) {
        // A failed snapshot leaves the updates in place; the next write retries.
        this.compact(noteId).catch(() => {})
      }
    }, 0)
  }

  private deliver(doc: StoredDoc | undefined) {
    if (!doc) return
    const parsed = parseDocId(doc._id)
    if (!parsed) return
    // Never reuse a sequence this device has already used, even one we only
    // learn about from the server or from a document that has been deleted.
    this.noteSeq(parsed.deviceId, parsed.seq)

    if (doc._deleted) {
      if (parsed.kind === 'u') {
        this.updates.get(parsed.noteId)?.delete(doc._id)
        this.covered.delete(doc._id)
      }
      return
    }

    if (doc.type === 'update' && doc.data !== undefined) {
      this.callbacks.onUpdate(parsed.noteId, fromBase64(doc.data))
      this.recordUpdate(parsed.noteId, doc._id, doc._rev)
    } else if (doc.type === 'snapshot' && doc.data !== undefined) {
      const snapshot = doc as SnapshotDoc
      const list = this.snapshots.get(parsed.noteId) ?? []
      if (!list.some((s) => s.id === snapshot._id)) {
        list.push({ id: snapshot._id, deviceId: snapshot.deviceId, createdAt: snapshot.createdAt })
      }
      this.snapshots.set(parsed.noteId, list)
      for (const id of snapshot.covers) {
        const covered = parseDocId(id)
        if (covered) this.noteSeq(covered.deviceId, covered.seq)
        if (this.updates.get(parsed.noteId)?.has(id)) this.covered.add(id)
      }
      this.callbacks.onUpdate(parsed.noteId, fromBase64(snapshot.data))
    }
  }

  /** Records an update document whose content is already applied to the note. */
  private recordUpdate(noteId: string, id: string, rev: string) {
    const revisions = this.updates.get(noteId) ?? new Map<string, string>()
    revisions.set(id, rev)
    this.updates.set(noteId, revisions)
    if (parseDocId(id)?.deviceId === this.options.deviceId) this.maybeScheduleSnapshot(noteId)
  }

  private noteSeq(deviceId: string, seq: number) {
    if (deviceId === this.options.deviceId) this.seq = Math.max(this.seq, seq)
  }
}

function docId(kind: 'u' | 's', noteId: string, deviceId: string, seq: number): string {
  return `${kind}:${noteId}:${deviceId}:${String(seq).padStart(12, '0')}`
}

/** Splits `<kind>:<note ID>:<device ID>:<seq>`; the device ID may contain colons. */
function parseDocId(id: string) {
  const parts = id.split(':')
  const [kind, noteId] = parts
  const seq = Number(parts.at(-1))
  if ((kind !== 'u' && kind !== 's') || !noteId || parts.length < 4 || !Number.isInteger(seq)) return undefined
  return { kind, noteId, deviceId: parts.slice(2, -1).join(':'), seq }
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
