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
import type { SpaceStorage } from './storage'

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
}

export interface Note {
  id: string
  title: string
  body: string
}

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

  constructor(readonly id: string) {}

  /** @internal Called once by the core after storage is open. */
  attach(storage: SpaceStorage) {
    this.storage = storage
  }

  /** @internal Applies an update read from storage. */
  receive(noteId: string, data: Uint8Array) {
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
      meta.set('createdAt', Date.now())
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
   * Deletes an empty folder. Folders that still hold notes or subfolders
   * can't be deleted yet; that needs the trash.
   */
  async deleteFolder(path: string): Promise<void> {
    const folder = this.existingFolder(path, { allowTop: false })
    if (this.listNotes().some((n) => isWithin(n.folder, folder))) {
      throw new Error(`"${folder}" still has notes in it`)
    }
    if (this.listFolders().some((f) => f !== folder && isWithin(f, folder))) {
      throw new Error(`"${folder}" still has folders in it`)
    }
    this.folderMap().delete(folder)
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

  listNotes(): NoteSummary[] {
    const notes: NoteSummary[] = []
    for (const [id, doc] of this.docs) {
      const meta = doc.getMap('meta')
      const title = meta.get('title')
      const folder = meta.get('folder')
      if (typeof title === 'string') notes.push({ id, title, folder: typeof folder === 'string' ? folder : '' })
    }
    return notes
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

  /** @internal The note's body as Yjs text, for the core's editor binding only. */
  bodyText(id: string): Y.Text {
    return this.existing(id).getText('body')
  }

  private folderMap(): Y.Map<boolean> {
    return this.doc(SPACE_DOC_ID).getMap('folders')
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
        this.notify()
      })
      this.docs.set(id, doc)
    }
    return doc
  }
}
