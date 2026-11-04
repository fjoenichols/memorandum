import PouchDB from 'pouchdb-core'
import MemoryAdapter from 'pouchdb-adapter-memory'
import { afterEach, describe, expect, it } from 'vitest'
import { createCore, type Core } from '../../src/core'
import { linksIn } from '../../src/features/links'

PouchDB.plugin(MemoryAdapter)

let core: Core | undefined
afterEach(async () => {
  await core?.close()
})

describe('wikilinks and spaces', () => {
  it('a link never resolves to a note in another space', async () => {
    const deviceId = crypto.randomUUID()
    core = createCore({ deviceId, openLocal: (name) => new PouchDB(`${deviceId}-${name}`, { adapter: 'memory' }) })
    const personal = await core.openSpace('personal')
    const family = await core.openSpace('family')

    await family.createNote({ title: 'Groceries' })
    const plan = await personal.createNote({ title: 'Plan' })
    await personal.editBody(plan, { index: 0, insert: '[[Groceries]]' })
    expect(linksIn(personal, plan).map((l) => l.noteId)).toEqual([undefined])

    const own = await personal.createNote({ title: 'Groceries' })
    expect(linksIn(personal, plan).map((l) => l.noteId)).toEqual([own])
  })
})
