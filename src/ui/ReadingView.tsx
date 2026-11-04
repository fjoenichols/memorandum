import { useCallback, useMemo, useSyncExternalStore, type MouseEvent } from 'react'
import type { Space } from '../core'
import { resolveWikilink } from '../features/links'
import { parseFrontmatter, renderMarkdown } from '../features/markdown'

interface Props {
  space: Space
  noteId: string
  onOpenNote: (noteId: string) => void
}

/** The note rendered as formatted text, with its frontmatter shown as properties. */
export function ReadingView({ space, noteId, onOpenNote }: Props) {
  const subscribe = useCallback((onChange: () => void) => space.subscribe(onChange), [space])
  const body = useSyncExternalStore(subscribe, () => space.readNote(noteId).body)
  // Links resolve against the space's current notes, so a rename or a note
  // arriving by sync updates them.
  const notes = useSyncExternalStore(subscribe, () => JSON.stringify(space.listNotes()))

  const { frontmatter, html } = useMemo(() => {
    const list = JSON.parse(notes) as ReturnType<Space['listNotes']>
    const frontmatter = parseFrontmatter(body)
    const html = renderMarkdown(frontmatter.content, {
      resolve: (target) => resolveWikilink(target, list)?.id,
      currentNoteId: noteId,
    })
    return { frontmatter, html }
  }, [body, notes, noteId])

  function followLink(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.wikilink')
    const target = link?.dataset.noteId
    if (!target) return
    event.preventDefault()
    onOpenNote(target)
  }

  const properties = Object.entries(frontmatter.properties)
  return (
    <article className="reading-view" aria-label="Reading view" onClick={followLink}>
      {properties.length > 0 && (
        <ul className="properties" aria-label="Properties">
          {properties.map(([key, value]) => (
            <li key={key}>
              <span className="property-key">{key}</span>
              <span className="property-value">{formatValue(value)}</span>
            </li>
          ))}
        </ul>
      )}
      {frontmatter.error && (
        <div className="properties-error">
          <p>These properties couldn't be read: {frontmatter.error}</p>
          <pre>{frontmatter.raw}</pre>
        </div>
      )}
      {/* Safe: the renderer shows raw HTML as text and refuses script URLs. */}
      <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}
