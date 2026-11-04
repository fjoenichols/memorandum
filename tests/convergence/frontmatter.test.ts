import { describe, expect, it } from 'vitest'
import { noteFrontmatter } from '../../src/features/markdown'
import { createHarness } from './harness'

describe('frontmatter', () => {
  it('properties written on one device are read on another, with the body unchanged byte for byte', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Trip' })
    const body = '---\r\nwhere: Lisbon\ndays:   4  \n# comment kept\ntags: [travel]\n---\nPack light.\n'
    await a.space.editBody(id, { index: 0, insert: body })
    await converge()

    expect(b.space.readNote(id).body).toBe(body)
    expect(noteFrontmatter(b.space, id).properties).toEqual({ where: 'Lisbon', days: 4, tags: ['travel'] })

    await b.space.editBody(id, { index: body.indexOf('Lisbon'), delete: 'Lisbon'.length, insert: 'Porto' })
    await converge()
    expect(noteFrontmatter(a.space, id).properties).toMatchObject({ where: 'Porto' })
  })

  it('a note with invalid frontmatter still reads and syncs', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Broken' })
    await a.space.editBody(id, { index: 0, insert: '---\nwhere: [Lisbon\n---\nStill here.' })
    await converge()

    const frontmatter = noteFrontmatter(b.space, id)
    expect(frontmatter.properties).toEqual({})
    expect(frontmatter.error).toBeDefined()
    expect(frontmatter.content).toBe('Still here.')
  })
})
