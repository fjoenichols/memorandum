import { describe, expect, it } from 'vitest'
import { linksIn } from '../../src/features/links'
import { createHarness } from './harness'

describe('wikilinks across devices', () => {
  it('a link resolves once the note it points at arrives from another device', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const source = await b.space.createNote({ title: 'Plan' })
    await b.space.editBody(source, { index: 0, insert: 'Buy things from [[Groceries|the list]].' })
    await converge()
    expect(linksIn(b.space, source).map((l) => l.noteId)).toEqual([undefined])

    const target = await a.space.createNote({ title: 'Groceries', folder: '' })
    await converge()
    expect(linksIn(b.space, source)).toEqual([
      { from: 16, to: 38, target: 'Groceries', heading: undefined, alias: 'the list', noteId: target },
    ])
  })
})
