import { describe, expect, it } from 'vitest'
import { personalSpaceId } from '../../src/core'
import {
  basicAuth,
  browserAuth,
  couchOrigin,
  newSharedSpace,
  newUser,
  ownerAuth,
  ownerCredentials,
  waitForAccess,
} from './auth-support'
import { joinSpaceAs } from './harness'

const settle = () => new Promise((resolve) => setTimeout(resolve, 1500))

describe('shared spaces and membership', () => {
  it('two members editing a shared space offline converge', async () => {
    const alice = await newUser()
    const bob = await newUser()
    const family = await newSharedSpace('Family', [alice, bob])

    const { devices, converge } = await joinSpaceAs(family.id, [basicAuth(alice), basicAuth(bob)])
    const [a, b] = devices
    if (!b) throw new Error('Expected two devices')
    const id = await a.space.createNote({ title: 'Groceries' })
    await a.space.editBody(id, { index: 0, insert: 'milk' })
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.editBody(id, { index: 0, insert: 'eggs, ' })
    await b.space.editBody(id, { index: 'milk'.length, insert: ', bread' })

    const state = await converge()
    expect(state.notes).toEqual([{ id, title: 'Groceries', body: 'eggs, milk, bread' }])
  })

  it('members learn their spaces, with names, from their own sign-in', async () => {
    const alice = await newUser()
    const family = await newSharedSpace('Family', [alice])
    await newSharedSpace('Not for Alice')

    const auth = browserAuth()
    const user = await auth.signIn(alice.name, alice.password)
    expect(user.sharedSpaceIds).toEqual([family.id])
    expect(await auth.spacesOf(user)).toEqual([
      { id: personalSpaceId(alice.name), name: 'Personal', kind: 'personal' },
      { id: family.id, name: 'Family', kind: 'shared' },
    ])
  })

  it("a non-member can't read a shared space or see its notes", async () => {
    const alice = await newUser()
    const mallory = await newUser()
    const family = await newSharedSpace('Family', [alice])
    const mine = await joinSpaceAs(family.id, [basicAuth(alice)])
    await mine.devices[0].space.createNote({ title: 'Family only' })

    const intruder = await joinSpaceAs(family.id, [basicAuth(mallory)])
    await settle()
    expect(intruder.devices[0].state().notes).toEqual([])
    const direct = await fetch(`${couchOrigin}/${family.id}`, { headers: { Authorization: basicAuth(mallory) } })
    expect(direct.status).toBe(403)
    expect(await browserAuth().signIn(mallory.name, mallory.password)).toMatchObject({ sharedSpaceIds: [] })
  })

  it('a removed member loses access, and their open device stops syncing without failing', async () => {
    const alice = await newUser()
    const bob = await newUser()
    const family = await newSharedSpace('Family', [alice, bob])
    const { devices, converge } = await joinSpaceAs(family.id, [basicAuth(alice), basicAuth(bob)])
    const [a, b] = devices
    if (!b) throw new Error('Expected two devices')
    await a.space.createNote({ title: 'Before' })
    await converge()

    await ownerAuth().removeMember(family.id, bob.name)
    expect(await waitForAccess(family.id, bob, 403)).toBe(403)
    expect((await browserAuth().signIn(bob.name, bob.password)).sharedSpaceIds).toEqual([])

    await a.space.createNote({ title: 'After' })
    await settle()
    // Bob's device keeps running; it just doesn't receive anything new.
    expect(b.state().notes.map((n) => n.title)).toEqual(['Before'])
  })

  it('the owner lists shared spaces with their members, and can add and remove members', async () => {
    const alice = await newUser()
    const bob = await newUser()
    const owner = ownerAuth()
    const family = await newSharedSpace('Family', [alice])

    await owner.addMember(family.id, bob.name)
    await owner.addMember(family.id, bob.name) // adding twice is harmless
    let listed = (await owner.listSharedSpaces()).find((s) => s.id === family.id)
    expect(listed).toEqual({ id: family.id, name: 'Family', members: [alice.name, bob.name].sort() })

    await owner.removeMember(family.id, alice.name)
    listed = (await owner.listSharedSpaces()).find((s) => s.id === family.id)
    expect(listed?.members).toEqual([bob.name])
    expect(await owner.listUsers()).toEqual(expect.arrayContaining([alice.name, bob.name]))
  })

  it('the owner belongs to every shared space', async () => {
    const family = await newSharedSpace('Family')
    const auth = browserAuth()
    const owner = await auth.signIn(ownerCredentials.name, ownerCredentials.password)
    expect(await auth.spacesOf(owner)).toEqual(
      expect.arrayContaining([
        { id: owner.personalSpaceId, name: 'Personal', kind: 'personal' },
        { id: family.id, name: 'Family', kind: 'shared' },
      ]),
    )
  })

  it('only the owner can create shared spaces or change members', async () => {
    const alice = await newUser()
    const family = await newSharedSpace('Family')
    const auth = browserAuth()
    await auth.signIn(alice.name, alice.password)
    await expect(auth.createSharedSpace('Mine')).rejects.toThrow(/owner/i)
    await expect(auth.addMember(family.id, alice.name)).rejects.toThrow(/owner/i)
    expect(await waitForAccess(family.id, alice, 403)).toBe(403)
  })

  it('a shared space needs a name', async () => {
    await expect(ownerAuth().createSharedSpace('   ')).rejects.toThrow(/name/i)
  })

  it('a closed space stops syncing and keeps its notes on the device', async () => {
    const alice = await newUser()
    const family = await newSharedSpace('Family', [alice])
    const { devices } = await joinSpaceAs(family.id, [basicAuth(alice), basicAuth(alice)])
    const [a, b] = devices
    if (!b) throw new Error('Expected two devices')
    await a.space.createNote({ title: 'Kept' })
    await expect.poll(() => b.space.listNotes().length).toBe(1)

    await b.core.closeSpace(family.id)
    await a.space.createNote({ title: 'Missed' })
    await settle()
    b.goOffline()
    const reopened = await b.core.openSpace(family.id)
    expect(reopened.listNotes().map((n) => n.title)).toEqual(['Kept'])
  })
})
