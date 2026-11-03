import { describe, expect, it } from 'vitest'
import { createHarness, type Device } from './harness'

/** Appends `count` words to a note one edit at a time, returning the added text. */
async function typeWords(device: Device, noteId: string, prefix: string, count: number): Promise<string> {
  let added = ''
  for (let i = 0; i < count; i++) {
    const word = `${prefix}${i} `
    await device.space.editBody(noteId, { index: device.space.readNote(noteId).body.length, insert: word })
    added += word
  }
  return added
}

function words(text: string): string[] {
  return text
    .trim()
    .split(' ')
    .map((word) => `${word} `)
}

// Snapshots only happen when a test asks, so each test controls when compaction runs.
const manual = { snapshotEvery: Infinity }

describe('snapshots and compaction', () => {
  it('compaction keeps the note intact and removes covered updates on every device', async () => {
    const { devices, converge } = await createHarness(2, manual)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Journal' })
    const body = await typeWords(a, id, 'a', 20)
    await converge()

    await a.space.compact()

    const state = await converge()
    expect(state.notes).toEqual([{ id, title: 'Journal', body }])
    for (const device of [a, b]) {
      await expect.poll(() => device.space.storedUpdateCount(id)).toBe(0)
      expect(device.space.listSnapshots(id)).toHaveLength(1)
    }
  })

  it('a note loads from a snapshot plus later updates after a restart', async () => {
    const { devices } = await createHarness(2, manual)
    const [a] = devices
    a.goOffline()
    const id = await a.space.createNote({ title: 'Journal' })
    const before = await typeWords(a, id, 'before', 10)
    await a.space.compact()
    const after = await typeWords(a, id, 'after', 5)

    await a.restart()
    expect(a.space.readNote(id)).toEqual({ id, title: 'Journal', body: before + after })
    expect(a.space.storedUpdateCount(id)).toBe(5)
    expect(a.space.listSnapshots(id)).toHaveLength(1)
  })

  it('a device that joins after compaction gets the full note from the snapshot', async () => {
    const harness = await createHarness(2, manual)
    const [a] = harness.devices
    const id = await a.space.createNote({ title: 'Journal' })
    const body = await typeWords(a, id, 'w', 15)
    await harness.converge()
    await a.space.compact()
    await harness.converge()
    await expect.poll(() => a.space.storedUpdateCount(id)).toBe(0)

    const c = await harness.addDevice()
    const state = await harness.converge()
    expect(state.notes).toEqual([{ id, title: 'Journal', body }])
    expect(c.space.readNote(id).body).toBe(body)
  })

  it("S9: compaction while another device is offline still merges that device's later updates", async () => {
    const { devices, converge } = await createHarness(2, manual)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    const shared = await typeWords(a, id, 'shared', 10)
    await converge()

    b.goOffline()
    const fromB = await typeWords(b, id, 'b', 10)
    const fromA = await typeWords(a, id, 'a', 10)
    await a.space.compact()
    const afterCompaction = await typeWords(a, id, 'late', 3)

    const body = (await converge()).notes[0]?.body ?? ''
    for (const word of words(shared + fromB + fromA + afterCompaction)) expect(body).toContain(word)

    // b's offline updates weren't in a's snapshot, so they stay until a later snapshot covers them.
    await b.space.compact()
    await converge()
    for (const device of [a, b]) await expect.poll(() => device.space.storedUpdateCount(id)).toBe(0)
    expect((await converge()).notes[0]?.body).toBe(body)
  })

  it('two offline devices compacting the same note both keep every edit', async () => {
    const { devices, converge } = await createHarness(2, manual)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Plan' })
    const shared = await typeWords(a, id, 'shared', 5)
    await converge()

    a.goOffline()
    b.goOffline()
    const fromA = await typeWords(a, id, 'a', 5)
    const fromB = await typeWords(b, id, 'b', 5)
    await Promise.all([a.space.compact(), b.space.compact()])

    const body = (await converge()).notes[0]?.body ?? ''
    for (const word of words(shared + fromA + fromB)) expect(body).toContain(word)
    for (const device of [a, b]) {
      await expect.poll(() => device.space.listSnapshots(id).length).toBe(2)
    }
  })

  it('snapshots are written automatically once a note has enough updates', async () => {
    const { devices, converge } = await createHarness(2, { snapshotEvery: 10 })
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Busy' })
    const body = await typeWords(a, id, 'w', 25)

    const state = await converge()
    expect(state.notes[0]?.body).toBe(body)
    for (const device of [a, b]) {
      await expect.poll(() => device.space.listSnapshots(id).length).toBeGreaterThanOrEqual(2)
      await expect.poll(() => device.space.storedUpdateCount(id)).toBeLessThan(10)
    }
  })

  it('a device whose own updates were compacted away keeps editing and compacting after restarting', async () => {
    const { devices, converge } = await createHarness(2, manual)
    const [a, b] = devices
    const id = await a.space.createNote({ title: 'Journal' })
    const first = await typeWords(a, id, 'first', 4)
    await a.space.compact()
    await converge()

    // After the restart none of a's own update documents remain. Alternating
    // single edits with compaction walks through the same sequence numbers a
    // used before the restart, so a device that forgot them would collide.
    await a.restart()
    let second = ''
    for (let i = 0; i < 4; i++) {
      second += await typeWords(a, id, `second${i}.`, 1)
      await a.space.compact()
    }

    const state = await converge()
    expect(state.notes[0]?.body).toBe(first + second)
    expect(b.space.readNote(id).body).toBe(first + second)
    expect(a.space.listSnapshots(id)).toHaveLength(5)
  })
})
