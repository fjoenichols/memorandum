import { useEffect, useState } from 'react'
import type { Space } from '../core'
import { NoteEditor } from './NoteEditor'
import { ReadingView } from './ReadingView'

interface Props {
  space: Space
  noteId: string
  onOpenNote: (noteId: string) => void
}

/**
 * An open note, in source mode or the reading view. The mode stays the same
 * when another note is opened. Ctrl/Cmd+E switches it, as in Obsidian.
 */
export function NoteView({ space, noteId, onOpenNote }: Props) {
  const [reading, setReading] = useState(false)

  useEffect(() => {
    // Cmd on Apple devices, where Ctrl+E means "end of line"; Ctrl elsewhere.
    const apple = /Mac|iPhone|iPad/.test(navigator.userAgent)
    function onKeyDown(event: KeyboardEvent) {
      const mod = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setReading((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="note-view">
      <div className="note-toolbar">
        <button type="button" aria-pressed={reading} title="Reading view (Ctrl/Cmd+E)" onClick={() => setReading((value) => !value)}>
          Reading view
        </button>
      </div>
      {reading ? (
        <ReadingView key={noteId} space={space} noteId={noteId} onOpenNote={onOpenNote} />
      ) : (
        <NoteEditor key={noteId} space={space} noteId={noteId} onOpenNote={onOpenNote} />
      )}
    </div>
  )
}
