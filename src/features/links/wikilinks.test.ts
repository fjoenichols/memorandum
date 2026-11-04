import { describe, expect, it } from 'vitest'
import type { NoteSummary } from '../../core'
import { parseWikilinks, resolveWikilink } from '.'

describe('parseWikilinks', () => {
  it('finds plain, aliased, heading, and folder-qualified links with their positions', () => {
    const text = 'See [[Groceries]], [[Groceries|the list]], [[Plan#Week 2]] and [[Recipes/Cake|cake]].'
    expect(parseWikilinks(text)).toEqual([
      { from: 4, to: 17, target: 'Groceries', heading: undefined, alias: undefined },
      { from: 19, to: 41, target: 'Groceries', heading: undefined, alias: 'the list' },
      { from: 43, to: 58, target: 'Plan', heading: 'Week 2', alias: undefined },
      { from: 63, to: 84, target: 'Recipes/Cake', heading: undefined, alias: 'cake' },
    ])
  })

  it('treats a heading link to the current note as a link with no target', () => {
    expect(parseWikilinks('[[#Intro]]')).toEqual([{ from: 0, to: 10, target: '', heading: 'Intro', alias: undefined }])
  })

  it('leaves embeds, block references, empty links, and unclosed links alone', () => {
    expect(parseWikilinks('![[Photo]] [[Note#^abc123]] [[]] [[open')).toEqual([])
  })

  it('does not span lines', () => {
    expect(parseWikilinks('[[Split\nlink]]')).toEqual([])
  })
})

const note = (id: string, title: string, folder = '', createdAt = 0): NoteSummary => ({ id, title, folder, createdAt })

describe('resolveWikilink', () => {
  const notes = [
    note('top', 'Cake'),
    note('deep', 'Cake', 'Recipes/Desserts'),
    note('mid', 'Cake', 'Recipes'),
    note('plan', 'Plan', 'Work'),
  ]

  it('prefers the shortest folder path when titles repeat across folders', () => {
    expect(resolveWikilink('Cake', notes)?.id).toBe('top')
    expect(resolveWikilink('Cake', notes.slice(1))?.id).toBe('mid')
  })

  it('an exact folder path wins over a shorter one', () => {
    expect(resolveWikilink('Recipes/Desserts/Cake', notes)?.id).toBe('deep')
    expect(resolveWikilink('Recipes/Cake', notes)?.id).toBe('mid')
  })

  it('a partial path matches the end of a folder path', () => {
    expect(resolveWikilink('Desserts/Cake', notes)?.id).toBe('deep')
  })

  it('finds a note in a folder by title alone', () => {
    expect(resolveWikilink('Plan', notes)?.id).toBe('plan')
  })

  it('matches titles and folders without regard to case, like Obsidian', () => {
    expect(resolveWikilink('recipes/desserts/CAKE', notes)?.id).toBe('deep')
  })

  it('returns nothing for a link to a note that does not exist', () => {
    expect(resolveWikilink('Missing', notes)).toBeUndefined()
    expect(resolveWikilink('Other/Plan', notes)).toBeUndefined()
    expect(resolveWikilink('', notes)).toBeUndefined()
  })

  it('picks the earliest-created note, then the lowest note ID, among duplicates in one folder', () => {
    const dupes = [note('b', 'Groceries', '', 5), note('c', 'Groceries', '', 1), note('a', 'Groceries', '', 5)]
    expect(resolveWikilink('Groceries', dupes)?.id).toBe('c')
    expect(resolveWikilink('Groceries', dupes.filter((n) => n.id !== 'c'))?.id).toBe('a')
  })
})
