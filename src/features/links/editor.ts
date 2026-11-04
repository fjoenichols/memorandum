import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { EditorState, RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { NoteSummary, Space } from '../../core'
import { notePath, parseWikilinks, resolveWikilink } from './wikilinks'

export interface WikilinkEditorOptions {
  space: Space
  /** Opens a note, the same way selecting it in the sidebar does. */
  openNote: (noteId: string) => void
}

/**
 * Editor extensions for wikilinks in source mode:
 * - typing `[[` suggests titles from the note's space;
 * - links are styled, with an open button after each one that resolves
 *   (works with mouse, touch, and keyboard), and Ctrl/Cmd-click as a desktop
 *   shortcut. A plain click still places the cursor so links stay editable.
 */
export function wikilinkExtensions({ space, openNote }: WikilinkEditorOptions): Extension[] {
  // Created once: autocomplete tells sources apart by identity, so a new
  // function per lookup would discard every result.
  const completions = [{ autocomplete: titleCompletions(space) }]
  return [
    EditorState.languageData.of(() => completions),
    linkDecorations(space, openNote),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos === null) return false
        const line = view.state.doc.lineAt(pos)
        const link = parseWikilinks(line.text).find((l) => line.from + l.from <= pos && pos <= line.from + l.to)
        const target = link?.target && resolveWikilink(link.target, space.listNotes())
        if (!target) return false
        event.preventDefault()
        openNote(target.id)
        return true
      },
    }),
    theme,
  ]
}

/** Suggests note titles after `[[`, inserting a path only when the title alone is ambiguous. */
function titleCompletions(space: Space) {
  return (context: CompletionContext): CompletionResult | null => {
    const typed = context.matchBefore(/(?<!!)\[\[[^[\]|#\n]*$/)
    if (!typed) return null
    const notes = space.listNotes()
    const titleCounts = new Map<string, number>()
    for (const n of notes) titleCounts.set(n.title.toLowerCase(), (titleCounts.get(n.title.toLowerCase()) ?? 0) + 1)

    return {
      from: typed.from + 2,
      validFor: /^[^[\]|#\n]*$/,
      options: notes.map((note) => ({
        label: note.title,
        detail: note.folder || undefined,
        apply: insertLink((titleCounts.get(note.title.toLowerCase()) ?? 0) > 1 ? notePath(note) : note.title),
      })),
    }
  }
}

/** Inserts the link text, closes the link if needed, and puts the cursor after it. */
function insertLink(text: string): Completion['apply'] {
  return (view, _completion, from, to) => {
    const closed = view.state.sliceDoc(to, to + 2) === ']]'
    const insert = closed ? text : `${text}]]`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + text.length + 2 },
      userEvent: 'input.complete',
    })
  }
}

const refresh = StateEffect.define<null>()

function linkDecorations(space: Space, openNote: (noteId: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      private notesKey: string
      private readonly unsubscribe: () => void

      constructor(readonly view: EditorView) {
        this.notesKey = keyOf(space.listNotes())
        this.decorations = this.build()
        // Another note being created, renamed, or moved can change what links
        // resolve to. Space changes can fire during an editor update, so the
        // refresh is deferred.
        this.unsubscribe = space.subscribe(() => {
          const key = keyOf(space.listNotes())
          if (key === this.notesKey) return
          this.notesKey = key
          queueMicrotask(() => this.view.dispatch({ effects: refresh.of(null) }))
        })
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)))
        if (update.docChanged || update.viewportChanged || refreshed) this.decorations = this.build()
      }

      destroy() {
        this.unsubscribe()
      }

      private build(): DecorationSet {
        const notes = space.listNotes()
        const builder = new RangeSetBuilder<Decoration>()
        const { doc } = this.view.state
        for (const { from, to } of this.view.visibleRanges) {
          for (let pos = from; pos <= to; ) {
            const line = doc.lineAt(pos)
            for (const link of parseWikilinks(line.text)) {
              const target = link.target ? resolveWikilink(link.target, notes) : undefined
              const start = line.from + link.from
              const end = line.from + link.to
              builder.add(start, end, target ? resolvedMark : unresolvedMark)
              if (target) builder.add(end, end, Decoration.widget({ widget: new OpenButton(target, openNote), side: 1 }))
            }
            pos = line.to + 1
          }
        }
        return builder.finish()
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

const resolvedMark = Decoration.mark({ class: 'cm-wikilink' })
const unresolvedMark = Decoration.mark({ class: 'cm-wikilink cm-wikilink-unresolved' })

class OpenButton extends WidgetType {
  constructor(
    readonly note: NoteSummary,
    readonly openNote: (noteId: string) => void,
  ) {
    super()
  }

  eq(other: OpenButton) {
    return other.note.id === this.note.id && other.note.title === this.note.title
  }

  toDOM() {
    const button = document.createElement('button')
    button.type = 'button'
    // The arrow is drawn in CSS so the editor's text stays exactly the note's text.
    button.className = 'cm-wikilink-open'
    button.setAttribute('aria-label', `Open ${this.note.title}`)
    button.title = `Open ${this.note.title}`
    // Keep the editor from moving the cursor before the click lands.
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', () => this.openNote(this.note.id))
    return button
  }

  ignoreEvent() {
    return true
  }
}

function keyOf(notes: NoteSummary[]): string {
  return notes
    .map((n) => `${n.id}\u0000${n.folder}\u0000${n.title}`)
    .sort()
    .join('\u0001')
}

const theme = EditorView.baseTheme({
  '.cm-wikilink': { color: '#2563eb', textDecoration: 'underline' },
  '.cm-wikilink-unresolved': { color: '#9ca3af', textDecorationStyle: 'dashed' },
  '.cm-wikilink-open': {
    border: 'none',
    background: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    padding: '0 0.3em',
    font: 'inherit',
    minWidth: '1.5em',
  },
  '.cm-wikilink-open::before': { content: '"↗"' },
})
