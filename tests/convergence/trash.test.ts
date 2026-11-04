import { describe, expect, it } from 'vitest'
import { linksIn } from '../../src/features/links'
import { createHarness } from './harness'

describe('trash', () => {
  it('S6: a note deleted on one device while another edits it is in trash on every device, with the edit', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Groceries' })
    await a.space.editBody(id, { index: 0, insert: 'milk' })
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.deleteNote(id)
    await b.space.editBody(id, { index: 4, insert: ' and eggs' })

    const state = await converge()
    expect(state.notes).toEqual([])
    expect(state.trash).toEqual([{ id, title: 'Groceries', body: 'milk and eggs' }])
  })

  it('S10: a note restored on one device while another edits it is restored with the edit', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    await a.space.editBody(id, { index: 0, insert: 'step one' })
    await a.space.deleteNote(id)
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.restoreNote(id)
    await b.space.editBody(id, { index: 8, insert: ', step two' })

    const state = await converge()
    expect(state.trash).toEqual([])
    expect(state.notes).toEqual([{ id, title: 'Plan', body: 'step one, step two' }])
  })
})

describe('trash rules', () => {
  it('a delete and a restore made offline on two devices converge to the same answer, with nothing lost', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    await a.space.editBody(id, { index: 0, insert: 'keep me' })
    await a.space.deleteNote(id)
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.restoreNote(id)
    await b.space.restoreNote(id)
    await b.space.deleteNote(id)

    const state = await converge()
    // One of the two wins, the same way on every device; either way the note survives intact.
    expect([...state.notes, ...state.trash]).toEqual([{ id, title: 'Plan', body: 'keep me' }])
  })

  it('trashed notes leave the folder tree and wikilink resolution', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    await a.space.createFolder('Only here')
    const target = await a.space.createNote({ title: 'Target', folder: 'Only here' })
    const source = await a.space.createNote({ title: 'Source' })
    await a.space.editBody(source, { index: 0, insert: 'see [[Target]]' })
    await a.space.deleteFolder('Only here')
    await converge()

    expect(b.space.listFolders()).toEqual([])
    expect(linksIn(b.space, source).map((l) => l.noteId)).toEqual([undefined])

    await b.space.restoreNote(target)
    const state = await converge()
    expect(state.folders).toEqual(['Only here'])
    expect(linksIn(a.space, source).map((l) => l.noteId)).toEqual([target])
  })
})

const DAY = 24 * 60 * 60 * 1000

describe('purge', () => {
  it('purging a trashed note removes it and its stored history from every device, for good', async () => {
    const { devices, converge } = await createHarness(2, { snapshotEvery: Infinity })
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Secret' })
    await a.space.editBody(id, { index: 0, insert: 'old draft' })
    await a.space.compact()
    await a.space.editBody(id, { index: 9, insert: ', newer' })
    await expect(a.space.purgeNote(id)).rejects.toThrow()
    await a.space.deleteNote(id)
    await converge()

    await b.space.purgeNote(id)

    const state = await converge()
    expect(state.notes).toEqual([])
    expect(state.trash).toEqual([])
    for (const device of devices) {
      await expect.poll(() => device.space.storedUpdateCount(id), { timeout: 10_000 }).toBe(0)
      await expect.poll(() => device.space.listSnapshots(id), { timeout: 10_000 }).toEqual([])
    }
    await a.restart()
    expect(a.space.listTrash()).toEqual([])
    expect(a.space.listNotes()).toEqual([])
  })

  it('purge wins over an edit or restore made by a device that was offline the whole time', async () => {
    const harness = await createHarness(2)
    const c = await harness.addDevice()
    const { devices, converge } = harness
    const [a, b] = devices
    const edited = await a.space.createNote({ title: 'Edited offline' })
    const restored = await a.space.createNote({ title: 'Restored offline' })
    await a.space.deleteNote(edited)
    await a.space.deleteNote(restored)
    await converge()

    b.goOffline()
    c.goOffline()
    await b.space.editBody(edited, { index: 0, insert: 'late words' })
    await c.space.restoreNote(restored)
    await a.space.purgeNote(edited)
    await a.space.purgeNote(restored)

    const state = await converge()
    expect(state.notes).toEqual([])
    expect(state.trash).toEqual([])
    for (const device of devices) {
      await expect
        .poll(() => device.space.storedUpdateCount(edited) + device.space.storedUpdateCount(restored), { timeout: 10_000 })
        .toBe(0)
    }
  })

  it('notes are purged automatically 30 days after they were deleted, not before', async () => {
    let clock = Date.UTC(2026, 0, 1)
    const { devices, converge } = await createHarness(2, { now: () => clock })
    const [a, b] = devices
    const old = await a.space.createNote({ title: 'Old' })
    await a.space.deleteNote(old)
    clock += 10 * DAY
    const recent = await a.space.createNote({ title: 'Recent' })
    await a.space.deleteNote(recent)
    await converge()

    clock += 20 * DAY - 1
    await b.space.purgeExpired()
    expect((await converge()).trash.map((n) => n.id).sort()).toEqual([old, recent].sort())

    clock += 1
    await b.space.purgeExpired()
    expect((await converge()).trash.map((n) => n.id)).toEqual([recent])

    // Opening a space also purges what has expired.
    clock += 10 * DAY
    await a.restart()
    expect(a.space.listTrash()).toEqual([])
    expect((await converge()).trash).toEqual([])
  })
})
