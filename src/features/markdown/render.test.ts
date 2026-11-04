import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '.'

const notes: Record<string, string> = { groceries: 'note-1', 'recipes/cake': 'note-2' }
const resolve = (target: string) => notes[target.toLowerCase()]
const render = (text: string) => renderMarkdown(text, { resolve }).trim()

describe('renderMarkdown', () => {
  it('renders ordinary Markdown', () => {
    expect(render('# Shopping\n\n- milk\n- **eggs**')).toBe(
      '<h1>Shopping</h1>\n<ul>\n<li>milk</li>\n<li><strong>eggs</strong></li>\n</ul>',
    )
  })

  describe('wikilinks', () => {
    it('renders a link that resolves as a link carrying the target note ID', () => {
      expect(render('Buy [[Groceries]] today')).toBe(
        '<p>Buy <a class="wikilink" href="#" data-note-id="note-1">Groceries</a> today</p>',
      )
    })

    it('shows the alias, or the heading after the title', () => {
      expect(render('[[Groceries|the list]]')).toContain('data-note-id="note-1">the list</a>')
      expect(render('[[Recipes/Cake#Icing]]')).toContain('data-note-id="note-2">Recipes/Cake &gt; Icing</a>')
    })

    it('renders a link that resolves nowhere distinctly, with no target', () => {
      expect(render('[[Nowhere]]')).toBe('<p><span class="wikilink unresolved" title="No note called “Nowhere”">Nowhere</span></p>')
    })

    it('points a heading-only link at the current note', () => {
      expect(renderMarkdown('[[#Top]]', { resolve, currentNoteId: 'self' })).toContain('data-note-id="self">Top</a>')
    })

    it('escapes link text', () => {
      expect(render('[[<b>x</b>]]')).toContain('&lt;b&gt;x&lt;/b&gt;</span>')
    })
  })

  describe('syntax kept as written', () => {
    it('shows embeds as plain text', () => {
      expect(render('See ![[Groceries]] here')).toBe('<p>See ![[Groceries]] here</p>')
    })

    it('shows block references and links to them as plain text', () => {
      expect(render('A line ^abc123')).toBe('<p>A line ^abc123</p>')
      expect(render('See [[Groceries#^abc123]]')).toBe('<p>See [[Groceries#^abc123]]</p>')
    })

    it('shows bracketed text that is not a wikilink as plain text', () => {
      expect(render('[[]] and [[ ]]')).toBe('<p>[[]] and [[ ]]</p>')
    })
  })

  describe('callouts', () => {
    it('renders a callout with its type and title', () => {
      expect(render('> [!warning] Mind the gap\n> Stand back.')).toBe(
        '<div class="callout" data-callout="warning">\n' +
          '<div class="callout-title">Mind the gap</div>\n' +
          '<div class="callout-content">\n<p>Stand back.</p>\n</div>\n</div>',
      )
    })

    it('uses the capitalised type as the title when none is given', () => {
      expect(render('> [!note]\n> Body')).toContain('<div class="callout-title">Note</div>')
    })

    it('renders a callout with no body', () => {
      expect(render('> [!tip] Just a title')).toBe(
        '<div class="callout" data-callout="tip">\n<div class="callout-title">Just a title</div>\n</div>',
      )
    })

    it('renders foldable callouts as details, open for + and closed for -', () => {
      expect(render('> [!faq]- Why?\n> Because.')).toMatch(
        /^<details class="callout" data-callout="faq">\n<summary class="callout-title">Why\?<\/summary>/,
      )
      expect(render('> [!faq]+ Why?\n> Because.')).toMatch(/^<details class="callout" data-callout="faq" open>/)
    })

    it('renders Markdown and wikilinks inside a callout', () => {
      const html = render('> [!info] See\n> **Bold** and [[Groceries]]')
      expect(html).toContain('<strong>Bold</strong>')
      expect(html).toContain('data-note-id="note-1"')
    })

    it('leaves ordinary blockquotes alone', () => {
      expect(render('> Just a quote')).toBe('<blockquote>\n<p>Just a quote</p>\n</blockquote>')
    })

    it('escapes the callout type and title', () => {
      expect(render('> [!x"><script>] <img src=x>')).not.toContain('<img')
      expect(render('> [!x"><script>] <img src=x>')).not.toContain('<script')
    })
  })

  describe('untrusted content', () => {
    it('shows raw HTML as text instead of rendering it', () => {
      const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;script&gt;')
    })

    it('refuses javascript: and data: links', () => {
      expect(render('[click](javascript:alert(1))')).not.toContain('href="javascript')
      expect(render('[click](data:text/html,<script>alert(1)</script>)')).not.toContain('href="data')
    })

    it('opens ordinary links in a new tab without giving it access to the app', () => {
      expect(render('[site](https://example.com)')).toBe(
        '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>',
      )
    })
  })
})
