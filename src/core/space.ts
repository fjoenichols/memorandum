import * as Y from 'yjs'
import type { SpaceStorage } from './storage'

/** Marks Yjs changes that came from storage, so they aren't written back. */
const FROM_STORAGE = Symbol('from-storage')

export interface NoteSummary {
  id: string
  title: string
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

  async createNote({ title }: { title: string }): Promise<string> {
    const id = crypto.randomUUID()
    const doc = this.doc(id)
    doc.transact(() => {
      const meta = doc.getMap('meta')
      meta.set('title', title)
      meta.set('createdAt', Date.now())
    })
    await this.flushed()
    return id
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
      const title = doc.getMap('meta').get('title')
      if (typeof title === 'string') notes.push({ id, title })
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
