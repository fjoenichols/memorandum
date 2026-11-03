import { useState } from 'react'
import type { Space } from '../core'
import { NoteEditor } from './NoteEditor'
import { Sidebar } from './Sidebar'
import { useHasUnsavedChanges } from './useSaveState'

export function NotesScreen({ space }: { space: Space }) {
  const unsaved = useHasUnsavedChanges(space)
  const [selected, setSelected] = useState<string>()

  return (
    <div className="layout">
      <Sidebar space={space} selectedNote={selected} onSelectNote={setSelected} />
      <main className="content">
        <p className="save-state" role="status">
          {unsaved ? 'Saving…' : 'All changes saved'}
        </p>
        {selected ? <NoteEditor key={selected} space={space} noteId={selected} /> : <p>Select or create a note.</p>}
      </main>
    </div>
  )
}
