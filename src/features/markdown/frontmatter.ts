import type { Space } from '../../core'
import { parse } from 'yaml'

/** A note's frontmatter, derived from its body on demand and never stored separately. */
export interface Frontmatter {
  /** Parsed key/value properties; empty when there's no block or it can't be read. */
  properties: Record<string, unknown>
  /** The block exactly as written, delimiters included; '' when there is none. */
  raw: string
  /** The body after the block. */
  content: string
  /** Why the block couldn't be read as properties, if it couldn't. */
  error: string | undefined
}

// Opening `---` on the very first line, closing `---` (or `...`) on its own line.
const BLOCK = /^---\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/**
 * Splits YAML frontmatter from a note body, following Obsidian: the block must
 * start on the first line. The body itself is never changed, so the block
 * stays byte-for-byte as written; invalid YAML gives no properties and an
 * error instead of throwing.
 */
export function parseFrontmatter(body: string): Frontmatter {
  const match = BLOCK.exec(body)
  if (!match) return { properties: {}, raw: '', content: body, error: undefined }

  const [raw, yaml = ''] = match
  const content = body.slice(raw.length)
  try {
    const value: unknown = parse(yaml)
    if (value === null || value === undefined) return { properties: {}, raw, content, error: undefined }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { properties: {}, raw, content, error: 'Frontmatter must be a list of key: value properties' }
    }
    return { properties: value as Record<string, unknown>, raw, content, error: undefined }
  } catch (err) {
    return { properties: {}, raw, content, error: err instanceof Error ? err.message : String(err) }
  }
}

/** A note's frontmatter, read through the core API. Derived on demand; never stored or synced separately. */
export function noteFrontmatter(space: Space, noteId: string): Frontmatter {
  return parseFrontmatter(space.readNote(noteId).body)
}
