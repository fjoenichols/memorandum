import { EditorView, basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import { noteEditorState, type Space } from '../core'

export function NoteEditor({ space, noteId }: { space: Space; noteId: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: noteEditorState(space, noteId, [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Note body' }),
      ]),
    })
    return () => view.destroy()
  }, [space, noteId])

  return <div ref={host} className="editor" />
}
