import * as Y from 'yjs'
import {
  folderName,
  isWithin,
  joinFolder,
  normalizeFolder,
  parentFolder,
  relocate,
  validName,
  withAncestors,
} from './folders'
import type { SnapshotInfo, SpaceStorage } from './storage'

/** Marks Yjs changes that came from storage, so they aren't written back. */
const FROM_STORAGE = Symbol('from-storage')

/**
 * The space document: one Yjs document per space, stored in the same update
 * log as notes, holding space-wide data such as the list of folders. Note IDs
 * are UUIDs, so this ID can't clash with one.
 */
const SPACE_DOC_ID = 'space'

export interface NoteSummary {
  id: string
  title: string
  /** The note's folder path; '' is the top level of the space. */
  folder: string
  /** When the note was created, in milliseconds since the epoch. */
  createdAt: number
}

export interface Note {
  id: string
  title: string
  body: string
}

/** A note in the space's trash. */
export interface TrashedNote extends NoteSummary {
  /** When the note was deleted, in milliseconds since the epoch. */
  deletedAt: number
}

/** Notes stay in trash this long before they're purged automatically. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** A programmatic edit to a note's body: delete then insert at `index`. */
export interface BodyEdit {
  index: number
  delete?: number
  insert?: string
}

/** One open space on this device. All notes live here as Yjs documents. */
export class Space {
  private readonly docs = new Map<string, Y.Doc>()
  private readonly listeners = new Set<() => void>()
  private readonly pending = new Set<Promise<void>>()
  private storage!: SpaceStorage

  /** `now` is the clock for creation, deletion, and purge times (injectable for tests). */
  constructor(
    readonly id: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** @internal Called once by the core after storage is open. */
  attach(storage: SpaceStorage) {
    this.storage = storage
    this.applyPurges()
  }

  /** @internal Applies an update read from storage. */
  receive(noteId: string, data: Uint8Array) {
    if (noteId !== SPACE_DOC_ID && this.purgedMap().has(noteId)) return
    Y.applyUpdate(this.doc(noteId), data, FROM_STORAGE)
  }

  async createNote({ title, folder = '' }: { title: string; folder?: string }): Promise<string> {
    const validTitle = validName(title, 'Title')
    const path = this.existingFolder(folder)
    const id = crypto.randomUUID()
    const doc = this.doc(id)
    doc.transact(() => {
      const meta = doc.getMap('meta')
      meta.set('title', validTitle)
      meta.set('folder', path)
      meta.set('createdAt', this.now())
    })
    await this.flushed()
    return id
  }

  /** Renames a note. Its note ID never changes. */
  async renameNote(id: string, title: string): Promise<void> {
    const validTitle = validName(title, 'Title')
    this.existing(id).getMap('meta').set('title', validTitle)
    await this.flushed()
  }

  /** Moves a note to another folder in this space ('' is the top level). Its note ID never changes. */
  async moveNote(id: string, folder: string): Promise<void> {
    const path = this.existingFolder(folder)
    this.existing(id).getMap('meta').set('folder', path)
    await this.flushed()
  }

  /** Creates a folder, along with any missing folders above it. */
  async createFolder(path: string): Promise<void> {
    const folder = normalizeFolder(path)
    if (!folder) throw new Error('Folder name can\'t be empty')
    const folders = this.folderMap()
    folders.doc?.transact(() => {
      for (const p of withAncestors(folder)) if (!folders.has(p)) folders.set(p, true)
    })
    await this.flushed()
  }

  /** Renames a folder in place; its notes and subfolders move with it. */
  async renameFolder(path: string, name: string): Promise<void> {
    const from = this.existingFolder(path, { allowTop: false })
    await this.relocateFolder(from, joinFolder(parentFolder(from), validName(name, 'Folder name')))
  }

  /** Moves a folder into another folder ('' is the top level); its notes and subfolders move with it. */
  async moveFolder(path: string, into: string): Promise<void> {
    const from = this.existingFolder(path, { allowTop: false })
    const parent = this.existingFolder(into)
    if (isWithin(parent, from)) throw new Error(`Can't move "${from}" into itself`)
    await this.relocateFolder(from, joinFolder(parent, folderName(from)))
  }

  /**
   * Deletes a folder and its subfolders. Their notes go to the trash, so
   * nothing is lost; restoring a note brings its folder back.
   */
  async deleteFolder(path: string): Promise<void> {
    const folder = this.existingFolder(path, { allowTop: false })
    const deletedAt = this.now()
    for (const note of this.listNotes()) {
      if (isWithin(note.folder, folder)) this.existing(note.id).getMap('meta').set('deleted', deletedAt)
    }
    const folders = this.folderMap()
    folders.doc?.transact(() => {
      for (const f of [...folders.keys()]) if (isWithin(f, folder)) folders.delete(f)
    })
    await this.flushed()
  }

  /**
   * Every folder in the space, sorted. Includes folders that only exist
   * because a note is in them (for example a note added offline to a folder
   * another device renamed), so no note is ever hidden.
   */
  listFolders(): string[] {
    const folders = new Set<string>()
    for (const path of this.folderMap().keys()) for (const p of withAncestors(path)) folders.add(p)
    for (const note of this.listNotes()) for (const p of withAncestors(note.folder)) folders.add(p)
    return [...folders].sort()
  }

  async editBody(id: string, edit: BodyEdit): Promise<void> {
    const text = this.existing(id).getText('body')
    text.doc?.transact(() => {
      if (edit.delete) text.delete(edit.index, edit.delete)
      if (edit.insert) text.insert(edit.index, edit.insert)
    })
    await this.flushed()
  }

  /**
   * Puts a note in its space's trash. Nothing is erased: edits made to it
   * meanwhile on other devices land in the trashed note, and it can be
   * restored until it's purged.
   */
  async deleteNote(id: string): Promise<void> {
    // One key holds the whole trash state (deletion time, or false), so a
    // concurrent delete and restore resolve to one consistent answer.
    this.existing(id).getMap('meta').set('deleted', this.now())
    await this.flushed()
  }

  /** Takes a note back out of the trash, into its folder (recreated if it's gone). */
  async restoreNote(id: string): Promise<void> {
    const meta = this.existing(id).getMap('meta')
    const folder = meta.get('folder')
    const folders = this.folderMap()
    folders.doc?.transact(() => {
      if (typeof folder === 'string') for (const p of withAncestors(folder)) if (!folders.has(p)) folders.set(p, true)
    })
    meta.set('deleted', false)
    await this.flushed()
  }

  /**
   * Permanently removes a trashed note from every device, along with its
   * stored history. Purge wins over everything else: edits or restores of
   * the note that arrive later, from a device that was offline, are dropped.
   */
  async purgeNote(id: string): Promise<void> {
    if (!this.listTrash().some((n) => n.id === id)) throw new Error('Only notes in the trash can be purged')
    this.purgedMap().set(id, this.now())
    await this.flushed()
  }

  /** Purges every note that has been in the trash for 30 days or more. */
  async purgeExpired(): Promise<void> {
    const cutoff = this.now() - TRASH_RETENTION_MS
    const expired = this.listTrash().filter((n) => n.deletedAt <= cutoff)
    if (expired.length === 0) return
    const purged = this.purgedMap()
    purged.doc?.transact(() => {
      for (const note of expired) purged.set(note.id, this.now())
    })
    await this.flushed()
  }

  /** Notes in the space, not counting trashed ones. */
  listNotes(): NoteSummary[] {
    return this.summaries()
      .filter((n) => n.deletedAt === undefined)
      .map(({ id, title, folder, createdAt }) => ({ id, title, folder, createdAt }))
  }

  /** Notes in the space's trash, most recently deleted first. */
  listTrash(): TrashedNote[] {
    return this.summaries()
      .filter((n): n is TrashedNote => n.deletedAt !== undefined)
      .sort((a, b) => b.deletedAt - a.deletedAt || a.id.localeCompare(b.id))
  }

  readNote(id: string): Note {
    const doc = this.existing(id)
    return { id, title: String(doc.getMap('meta').get('title')), body: doc.getText('body').toString() }
  }

  /** True while some local changes are not yet stored on this device. */
  hasUnsavedChanges(): boolean {
    return this.pending.size > 0
  }

  /**
   * Calls `listener` after any change to any note in this space, or to
   * whether there are unsaved changes. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Snapshots every note with updates not yet in a snapshot, then removes the
   * update documents each snapshot covers. This also happens automatically as
   * notes grow; call it directly to compact now.
   */
  compact(): Promise<void> {
    return this.storage.compactAll()
  }

  /** Snapshots stored for a note, oldest first. Kept for version history. */
  listSnapshots(id: string): SnapshotInfo[] {
    return this.storage.listSnapshots(id)
  }

  /** How many update documents for a note this device currently stores (diagnostic). */
  storedUpdateCount(id: string): number {
    return this.storage.updateCount(id)
  }

  /** @internal The note's full state, for the storage module's snapshots. */
  encodeState(id: string): Uint8Array {
    return Y.encodeStateAsUpdate(this.existing(id))
  }

  /** @internal The note's body as Yjs text, for the core's editor binding only. */
  bodyText(id: string): Y.Text {
    return this.existing(id).getText('body')
  }

  /** Every note in the space, live or trashed, with its deletion time if trashed. */
  private summaries(): (NoteSummary & { deletedAt?: number })[] {
    const notes: (NoteSummary & { deletedAt?: number })[] = []
    for (const [id, doc] of this.docs) {
      const meta = doc.getMap('meta')
      const title = meta.get('title')
      const folder = meta.get('folder')
      const createdAt = meta.get('createdAt')
      const deleted = meta.get('deleted')
      if (typeof title === 'string') {
        notes.push({
          id,
          title,
          folder: typeof folder === 'string' ? folder : '',
          createdAt: typeof createdAt === 'number' ? createdAt : 0,
          ...(typeof deleted === 'number' ? { deletedAt: deleted } : {}),
        })
      }
    }
    return notes
  }

  private folderMap(): Y.Map<boolean> {
    return this.doc(SPACE_DOC_ID).getMap('folders')
  }

  /** Purged note IDs and when they were purged. Kept forever, so late arrivals are recognized. */
  private purgedMap(): Y.Map<number> {
    return this.doc(SPACE_DOC_ID).getMap('purged')
  }

  /** Drops purged notes from memory and has storage remove their documents. */
  private applyPurges() {
    if (!this.storage) return
    for (const id of this.purgedMap().keys()) {
      const doc = this.docs.get(id)
      if (doc) {
        this.docs.delete(id)
        doc.destroy()
      }
      this.storage.forget(id)
    }
  }

  /** Normalizes a folder path and checks it exists ('' is the top level). */
  private existingFolder(path: string, { allowTop = true } = {}): string {
    const folder = normalizeFolder(path)
    if (!folder && allowTop) return folder
    if (!folder || !this.listFolders().includes(folder)) throw new Error(`No folder "${path}"`)
    return folder
  }

  /** Moves a folder, its subfolders, and its notes from one path to another. */
  private async relocateFolder(from: string, to: string): Promise<void> {
    if (from === to) return
    if (this.listFolders().includes(to)) throw new Error(`A folder "${to}" already exists`)

    const folders = this.folderMap()
    const subfolders = this.listFolders().filter((f) => isWithin(f, from))
    folders.doc?.transact(() => {
      for (const p of withAncestors(to)) if (!folders.has(p)) folders.set(p, true)
      for (const f of subfolders) {
        folders.delete(f)
        folders.set(relocate(f, from, to), true)
      }
    })
    for (const note of this.listNotes()) {
      if (isWithin(note.folder, from)) this.existing(note.id).getMap('meta').set('folder', relocate(note.folder, from, to))
    }
    await this.flushed()
  }

  /** Resolves once every local change so far is stored; rejects if any failed. */
  private async flushed(): Promise<void> {
    await Promise.all(this.pending)
  }

  private track(write: Promise<void>) {
    this.pending.add(write)
    if (this.pending.size === 1) this.notify()
    // Errors reach whoever awaits flushed(); surfacing them in the UI is the sync-status ticket's job.
    write
      .catch(() => {})
      .finally(() => {
        this.pending.delete(write)
        if (this.pending.size === 0) this.notify()
      })
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  private existing(id: string): Y.Doc {
    const doc = this.docs.get(id)
    if (!doc) throw new Error(`No note ${id} in space ${this.id}`)
    return doc
  }

  private doc(id: string): Y.Doc {
    let doc = this.docs.get(id)
    if (!doc) {
      doc = new Y.Doc()
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin !== FROM_STORAGE) this.track(this.storage.append(id, update))
        if (id === SPACE_DOC_ID) this.applyPurges()
        this.notify()
      })
      this.docs.set(id, doc)
    }
    return doc
  }
}
