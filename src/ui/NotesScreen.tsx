import { useState } from 'react'
import type { Space } from '../core'
import { NoteEditor } from './NoteEditor'
import { Sidebar } from './Sidebar'
import { useNotes } from './useNotes'
import { useHasUnsavedChanges } from './useSaveState'

export function NotesScreen({ space }: { space: Space }) {
  const unsaved = useHasUnsavedChanges(space)
  const [chosen, setSelected] = useState<string>()
  // A note that's deleted (here or on another device) closes.
  const notes = useNotes(space)
  const selected = notes.some((n) => n.id === chosen) ? chosen : undefined

  return (
    <div className="layout">
      <Sidebar space={space} selectedNote={selected} onSelectNote={setSelected} />
      <main className="content">
        <p className="save-state" role="status">
          {unsaved ? 'Saving…' : 'All changes saved'}
        </p>
        {selected ? <NoteEditor key={selected} space={space} noteId={selected} onOpenNote={setSelected} /> : <p>Select or create a note.</p>}
      </main>
    </div>
  )
}
