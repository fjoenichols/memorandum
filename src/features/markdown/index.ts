/**
 * Markdown feature: frontmatter parsing and the reading-view renderer.
 * Uses only the core API; everything here is derived from a note's body on
 * demand and never synced.
 */
export { noteFrontmatter, parseFrontmatter, type Frontmatter } from './frontmatter'
export { renderMarkdown, type RenderOptions } from './render'
