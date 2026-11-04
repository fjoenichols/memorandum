import MarkdownIt, { type StateCore, type StateInline, type Token } from 'markdown-it'
import { parseWikilinks, type Wikilink } from '../links'

export interface RenderOptions {
  /** The note ID a wikilink target points at in the note's space, if any. */
  resolve: (target: string) => string | undefined
  /** The note being rendered, so `[[#Heading]]` can point at itself. */
  currentNoteId?: string
}

interface Callout {
  type: string
  title: string
  /** '+' starts open, '-' starts closed, '' isn't foldable. */
  fold: '' | '+' | '-'
  hasBody: boolean
}

/**
 * Raw HTML is shown as text (`html: false`), so note content can never inject
 * markup or script; markdown-it's link validation already refuses
 * `javascript:`, `vbscript:`, `file:`, and non-image `data:` URLs.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })
const { escapeHtml } = md.utils

md.inline.ruler.before('link', 'wikilink', wikilinkRule)
md.core.ruler.after('block', 'callout', calloutRule)

// markdown-it types token metadata and the render environment as plain
// records, so values are kept under these keys.
const LINK = 'wikilink'
const CALLOUT = 'callout'
const OPTIONS = 'options'

md.renderer.rules.wikilink = (tokens, idx, _options, env) => {
  const link = tokens[idx]?.meta?.[LINK] as Wikilink
  const { resolve, currentNoteId } = env?.[OPTIONS] as RenderOptions
  const noteId = link.target ? resolve(link.target) : currentNoteId
  const label = link.alias ?? (link.target ? (link.heading ? `${link.target} > ${link.heading}` : link.target) : (link.heading ?? ''))
  if (noteId) return `<a class="wikilink" href="#" data-note-id="${escapeHtml(noteId)}">${escapeHtml(label)}</a>`
  return `<span class="wikilink unresolved" title="No note called “${escapeHtml(link.target)}”">${escapeHtml(label)}</span>`
}

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  // Outside links open in a new tab, without access to the app's window.
  tokens[idx]?.attrSet('target', '_blank')
  tokens[idx]?.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.blockquote_open = (tokens, idx, options, _env, self) => {
  const callout = tokens[idx]?.meta?.[CALLOUT] as Callout | undefined
  if (!callout) return self.renderToken(tokens, idx, options)
  const type = escapeHtml(callout.type)
  const title = escapeHtml(callout.title)
  const head = callout.fold
    ? `<details class="callout" data-callout="${type}"${callout.fold === '+' ? ' open' : ''}>\n<summary class="callout-title">${title}</summary>\n`
    : `<div class="callout" data-callout="${type}">\n<div class="callout-title">${title}</div>\n`
  return head + (callout.hasBody ? '<div class="callout-content">\n' : '')
}

md.renderer.rules.blockquote_close = (tokens, idx, options, _env, self) => {
  const callout = tokens[idx]?.meta?.[CALLOUT] as Callout | undefined
  if (!callout) return self.renderToken(tokens, idx, options)
  return (callout.hasBody ? '</div>\n' : '') + (callout.fold ? '</details>\n' : '</div>\n')
}

/**
 * Renders a note's Markdown (without its frontmatter) to HTML for the reading
 * view. Wikilinks use the links module's parsing; anything this app doesn't
 * understand yet (embeds, block references) shows as the text it is.
 */
export function renderMarkdown(text: string, options: RenderOptions): string {
  return md.render(text, { [OPTIONS]: options })
}

/**
 * Inline rule for `[[...]]` and `![[...]]`. Wikilinks the links module
 * recognises become `wikilink` tokens; embeds, block-reference links, and
 * empty brackets stay exactly as written.
 */
function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  const start = src.charCodeAt(pos) === 0x21 /* ! */ ? pos + 1 : pos
  if (!src.startsWith('[[', start)) return false
  const end = src.indexOf(']]', start + 2)
  if (end === -1) return false
  const inner = src.slice(start + 2, end)
  if (/[[\]\n]/.test(inner)) return false

  if (!silent) {
    const whole = src.slice(pos, end + 2)
    const link = start === pos ? parseWikilinks(whole)[0] : undefined
    if (link) {
      state.push('wikilink', '', 0).meta = { [LINK]: link }
    } else {
      state.push('text', '', 0).content = whole
    }
  }
  state.pos = end + 2
  return true
}

const CALLOUT_HEAD = /^\[!([^\]\s]+)\]([+-]?)[ \t]*(.*)$/

/** Turns blockquotes whose first line is `[!type] Title` into callouts, as Obsidian does. */
function calloutRule(state: StateCore) {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    const inline = tokens[i + 2]
    if (open?.type !== 'blockquote_open' || tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue

    const newline = inline.content.indexOf('\n')
    const firstLine = newline === -1 ? inline.content : inline.content.slice(0, newline)
    const head = CALLOUT_HEAD.exec(firstLine)
    if (!head) continue

    const [, rawType = '', fold = '', title = ''] = head
    const type = rawType.toLowerCase()
    const rest = newline === -1 ? '' : inline.content.slice(newline + 1)
    if (rest) {
      inline.content = rest
    } else {
      tokens.splice(i + 1, 3)
    }

    const close = matchingClose(tokens, i)
    const callout: Callout = {
      type,
      title: title.trim() || type.charAt(0).toUpperCase() + type.slice(1),
      fold: fold as Callout['fold'],
      hasBody: close !== undefined && close > i + 1,
    }
    open.meta = { [CALLOUT]: callout }
    if (close !== undefined) (tokens[close] as Token).meta = { [CALLOUT]: callout }
  }
}

function matchingClose(tokens: Token[], openIndex: number): number | undefined {
  let depth = 0
  for (let i = openIndex; i < tokens.length; i++) {
    const type = tokens[i]?.type
    if (type === 'blockquote_open') depth++
    else if (type === 'blockquote_close' && --depth === 0) return i
  }
  return undefined
}
