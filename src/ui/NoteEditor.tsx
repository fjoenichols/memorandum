import { EditorView, basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import { noteEditorState, type Space } from '../core'
import { wikilinkExtensions } from '../features/links'

interface Props {
  space: Space
  noteId: string
  /** Opens another note, e.g. when a wikilink is followed. */
  onOpenNote: (noteId: string) => void
}

export function NoteEditor({ space, noteId, onOpenNote }: Props) {
  const host = useRef<HTMLDivElement>(null)
  // Read through a ref so a new callback doesn't rebuild the editor.
  const openNote = useRef(onOpenNote)
  useEffect(() => {
    openNote.current = onOpenNote
  }, [onOpenNote])

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: noteEditorState(space, noteId, [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Note body' }),
        wikilinkExtensions({ space, openNote: (id) => openNote.current(id) }),
      ]),
    })
    return () => view.destroy()
  }, [space, noteId])

  return <div ref={host} className="editor" />
}
