import { markdown } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'
import { yCollab } from 'y-codemirror.next'
import type { Space } from './space'

/**
 * Editor state bound to a note's body (source mode). The binding only syncs
 * changes, so the editor must start from the body's current text.
 */
export function noteEditorState(space: Space, noteId: string, extensions: Extension[] = []): EditorState {
  const body = space.bodyText(noteId)
  return EditorState.create({
    doc: body.toString(),
    extensions: [...extensions, markdown(), yCollab(body, null)],
  })
}
