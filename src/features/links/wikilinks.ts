import type { NoteSummary, Space } from '../../core'

/** A `[[...]]` link found in a note's body. */
export interface Wikilink {
  /** Offset of the opening `[[`. */
  from: number
  /** Offset just past the closing `]]`. */
  to: number
  /** The note the link points at, as written: a title or a folder path ending in a title. '' for `[[#Heading]]`. */
  target: string
  heading: string | undefined
  alias: string | undefined
}

const LINK = /(!?)\[\[([^[\]\n]*)\]\]/g

/**
 * Finds every wikilink in `text`. Embeds (`![[...]]`) and block references
 * (`[[Note#^id]]`) are phase 2 and are left as plain text.
 */
export function parseWikilinks(text: string): Wikilink[] {
  const links: Wikilink[] = []
  for (const match of text.matchAll(LINK)) {
    const [whole, bang, inner = ''] = match
    if (bang) continue
    const pipe = inner.indexOf('|')
    const pathPart = pipe === -1 ? inner : inner.slice(0, pipe)
    const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim() || undefined
    const hash = pathPart.indexOf('#')
    const target = (hash === -1 ? pathPart : pathPart.slice(0, hash)).trim()
    const heading = hash === -1 ? undefined : pathPart.slice(hash + 1).trim() || undefined
    if (heading?.startsWith('^')) continue
    if (!target && !heading) continue
    links.push({ from: match.index, to: match.index + whole.length, target, heading, alias })
  }
  return links
}

/** The path a link would use to name this note exactly: "Folder/Sub/Title". */
export function notePath(note: Pick<NoteSummary, 'title' | 'folder'>): string {
  return note.folder ? `${note.folder}/${note.title}` : note.title
}

/**
 * Finds the note a link target points at among one space's notes, following
 * Obsidian: an exact path wins; otherwise the note whose path ends with the
 * target, preferring the shortest folder path. Matching ignores case.
 *
 * Until title collisions are handled (ADR-0004), several notes can share a
 * path; the earliest-created, then the lowest note ID, wins, so every device
 * picks the same one.
 */
export function resolveWikilink(target: string, notes: readonly NoteSummary[]): NoteSummary | undefined {
  const wanted = target.trim().toLowerCase()
  if (!wanted) return undefined

  const exact = notes.filter((n) => notePath(n).toLowerCase() === wanted)
  if (exact.length > 0) return exact.sort(byAge)[0]

  const suffix = `/${wanted}`
  return notes.filter((n) => notePath(n).toLowerCase().endsWith(suffix)).sort(byShortestFolder)[0]
}

/** A wikilink plus the note it resolves to in its space, if any. */
export interface ResolvedWikilink extends Wikilink {
  /** The note ID the link points at, or undefined if no note matches. `[[#Heading]]` points at its own note. */
  noteId: string | undefined
}

/**
 * Every wikilink in a note's body, resolved against the note's own space.
 * Computed from the core API on demand, never stored or synced. Positions and
 * note IDs are what rename rewriting (#12) needs to update links by note ID.
 */
export function linksIn(space: Space, noteId: string): ResolvedWikilink[] {
  const notes = space.listNotes()
  return parseWikilinks(space.readNote(noteId).body).map((link) => ({
    ...link,
    noteId: link.target ? resolveWikilink(link.target, notes)?.id : noteId,
  }))
}

function byAge(a: NoteSummary, b: NoteSummary): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function byShortestFolder(a: NoteSummary, b: NoteSummary): number {
  const depth = (n: NoteSummary) => n.folder.split('/').length
  return depth(a) - depth(b) || a.folder.length - b.folder.length || byAge(a, b)
}
