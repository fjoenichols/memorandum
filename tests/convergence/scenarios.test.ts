import { describe, expect, it } from 'vitest'
import { createHarness } from './harness'

describe('convergence', () => {
  it('a note created on one device appears on another', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    const id = await a.space.createNote({ title: 'Groceries' })
    await a.space.editBody(id, { index: 0, insert: 'milk' })

    const state = await converge()
    expect(state.notes).toEqual([{ id, title: 'Groceries', body: 'milk' }])
  })

  it('an offline device receives nothing until it reconnects', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    await converge()

    b.goOffline()
    await a.space.editBody(id, { index: 0, insert: 'while b was away' })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(b.space.readNote(id).body).toBe('')

    const state = await converge()
    expect(state.notes[0]?.body).toBe('while b was away')
  })

  it('S1: edits to different parts of one note made offline on two devices both survive', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    await a.space.editBody(id, { index: 0, insert: 'line one\nline two\n' })
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.editBody(id, { index: 0, insert: 'A: ' })
    await b.space.editBody(id, { index: 'line one\nline two\n'.length, insert: 'B wrote this' })

    const state = await converge()
    expect(state.notes[0]?.body).toBe('A: line one\nline two\nB wrote this')
  })

  it('S2: edits to the same line made offline on two devices merge identically with no text lost', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Groceries' })
    await a.space.editBody(id, { index: 0, insert: 'buy milk' })
    await converge()

    a.goOffline()
    b.goOffline()
    // a replaces "milk" with "eggs"; b appends to the same line.
    await a.space.editBody(id, { index: 4, delete: 4, insert: 'eggs' })
    await b.space.editBody(id, { index: 8, insert: ' and bread' })

    const body = (await converge()).notes[0]?.body ?? ''
    expect(body).toContain('eggs')
    expect(body).toContain(' and bread')
    expect(body).not.toContain('milk')
    expect(body.startsWith('buy ')).toBe(true)
  })

  it('S8: a device that makes many edits offline syncs them all when it reconnects', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const shared = await b.space.createNote({ title: 'Shared' })
    await converge()

    a.goOffline()
    const expected = new Map<string, string>()
    for (let n = 0; n < 5; n++) {
      const id = await a.space.createNote({ title: `Offline ${n}` })
      let body = ''
      for (let i = 0; i < 40; i++) {
        const word = `w${n}.${i} `
        await a.space.editBody(id, { index: body.length, insert: word })
        body += word
      }
      expected.set(id, body)
    }
    for (let i = 0; i < 40; i++) {
      await a.space.editBody(shared, { index: 0, insert: `${i},` })
    }
    // Meanwhile b keeps working online.
    await b.space.editBody(shared, { index: 0, insert: 'from b|' })

    const state = await converge()
    expect(state.notes).toHaveLength(6)
    for (const [id, body] of expected) {
      expect(state.notes.find((n) => n.id === id)?.body).toBe(body)
    }
    const sharedBody = state.notes.find((n) => n.id === shared)?.body ?? ''
    expect(sharedBody).toContain('from b|')
    for (let i = 0; i < 40; i++) expect(sharedBody).toContain(`${i},`)
  })

  it('a device that restarts keeps its notes and keeps syncing new edits', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    const id = await a.space.createNote({ title: 'Journal' })
    await a.space.editBody(id, { index: 0, insert: 'before' })
    await converge()

    a.goOffline()
    await a.space.editBody(id, { index: 6, insert: ' offline' })
    await a.restart()
    expect(a.space.readNote(id).body).toBe('before offline')

    await a.space.editBody(id, { index: 14, insert: ' after restart' })
    const state = await converge()
    expect(state.notes[0]?.body).toBe('before offline after restart')
  })
})
