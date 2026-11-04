/**
 * Wikilinks feature: parsing, resolution within a space, and the editor
 * extensions for autocomplete and navigation. Uses only the core API; any
 * link index is derived locally and never synced.
 */
export { wikilinkExtensions, type WikilinkEditorOptions } from './editor'
export { linksIn, notePath, parseWikilinks, resolveWikilink, type ResolvedWikilink, type Wikilink } from './wikilinks'
