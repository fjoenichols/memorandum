import { useState, type FormEvent } from 'react'
import type { Space } from '../core'
import { NoteEditor } from './NoteEditor'
import { useNotes } from './useNotes'
import { useHasUnsavedChanges } from './useSaveState'

export function NotesScreen({ space }: { space: Space }) {
  const notes = useNotes(space)
  const unsaved = useHasUnsavedChanges(space)
  const [selected, setSelected] = useState<string>()
  const [title, setTitle] = useState('')

  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const id = await space.createNote({ title: trimmed })
    setTitle('')
    setSelected(id)
  }

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Notes">
        <form onSubmit={create}>
          <input aria-label="New note title" placeholder="New note title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit">Create note</button>
        </form>
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <button type="button" aria-current={note.id === selected} onClick={() => setSelected(note.id)}>
                {note.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <p className="save-state" role="status">
          {unsaved ? 'Saving…' : 'All changes saved'}
        </p>
        {selected ? <NoteEditor key={selected} space={space} noteId={selected} /> : <p>Select or create a note.</p>}
      </main>
    </div>
  )
}
