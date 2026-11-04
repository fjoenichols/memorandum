import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from '.'

describe('parseFrontmatter', () => {
  it('parses a YAML block at the very top into properties and returns the rest as content', () => {
    const body = '---\ntitle: Groceries\ntags: [food, weekly]\ncount: 3\n---\n# Shopping\nmilk\n'
    expect(parseFrontmatter(body)).toEqual({
      properties: { title: 'Groceries', tags: ['food', 'weekly'], count: 3 },
      raw: '---\ntitle: Groceries\ntags: [food, weekly]\ncount: 3\n---\n',
      content: '# Shopping\nmilk\n',
      error: undefined,
    })
  })

  it('returns no properties when the note has no frontmatter', () => {
    expect(parseFrontmatter('# Just a note\n---\nnot: frontmatter\n---\n')).toEqual({
      properties: {},
      raw: '',
      content: '# Just a note\n---\nnot: frontmatter\n---\n',
      error: undefined,
    })
  })

  it('needs the opening line to be exactly --- at the start', () => {
    expect(parseFrontmatter(' ---\na: 1\n---\n').raw).toBe('')
    expect(parseFrontmatter('\n---\na: 1\n---\n').raw).toBe('')
  })

  it('treats an unclosed block as ordinary content', () => {
    expect(parseFrontmatter('---\na: 1\nstill writing').raw).toBe('')
  })

  it('accepts a closing line at the end of the note with no trailing newline, and Windows line endings', () => {
    expect(parseFrontmatter('---\na: 1\n---').properties).toEqual({ a: 1 })
    expect(parseFrontmatter('---\r\na: 1\r\n---\r\nbody').properties).toEqual({ a: 1 })
    expect(parseFrontmatter('---\r\na: 1\r\n---\r\nbody').content).toBe('body')
  })

  it('reports invalid YAML without throwing, keeping the block as raw text', () => {
    const result = parseFrontmatter('---\ntitle: [unclosed\n---\nbody')
    expect(result.properties).toEqual({})
    expect(result.raw).toBe('---\ntitle: [unclosed\n---\n')
    expect(result.content).toBe('body')
    expect(result.error).toMatch(/./)
  })

  it('treats a block that is not a key/value map as having no properties', () => {
    const result = parseFrontmatter('---\n- just\n- a list\n---\nbody')
    expect(result.properties).toEqual({})
    expect(result.error).toMatch(/key/)
  })

  it('treats an empty block as no properties and no error', () => {
    expect(parseFrontmatter('---\n---\nbody')).toEqual({ properties: {}, raw: '---\n---\n', content: 'body', error: undefined })
  })
})
