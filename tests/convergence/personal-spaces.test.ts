import { describe, expect, it } from 'vitest'
import { personalSpaceId, SignInError } from '../../src/core'
import { basicAuth, browserAuth, couchOrigin, newUser, ownerAuth, ownerCredentials } from './auth-support'
import { joinSpace } from './harness'

const settle = () => new Promise((resolve) => setTimeout(resolve, 1500))

describe('sign-in and personal spaces', () => {
  it('a user the owner created can sign in, stays signed in, and can sign out', async () => {
    const alice = await newUser()
    const auth = browserAuth()
    expect(await auth.currentUser()).toBeNull()

    const user = await auth.signIn(alice.name, alice.password)
    expect(user).toEqual({ name: alice.name, isOwner: false, personalSpaceId: personalSpaceId(alice.name) })
    expect(await auth.currentUser()).toEqual(user)

    await auth.signOut()
    expect(await auth.currentUser()).toBeNull()
  })

  it('signing in with the wrong password fails', async () => {
    const alice = await newUser()
    await expect(browserAuth().signIn(alice.name, 'wrong')).rejects.toBeInstanceOf(SignInError)
  })

  it("a new user's personal space syncs between their own devices", async () => {
    const alice = await newUser()
    const { devices, converge } = await joinSpace(personalSpaceId(alice.name), basicAuth(alice), 2)
    const id = await devices[0].space.createNote({ title: 'Mine' })

    const state = await converge()
    expect(state.notes).toEqual([{ id, title: 'Mine', body: '' }])
  })

  it("another user can neither read nor write someone's personal space", async () => {
    const alice = await newUser()
    const bob = await newUser()
    const space = personalSpaceId(alice.name)
    const mine = await joinSpace(space, basicAuth(alice), 2)
    const secret = await mine.devices[0].space.createNote({ title: 'Secret' })
    await mine.converge()

    const intruder = await joinSpace(space, basicAuth(bob), 1)
    await intruder.devices[0].space.createNote({ title: 'Planted' })
    await settle()

    expect(intruder.devices[0].state().notes.map((n) => n.id)).not.toContain(secret)
    expect((await mine.converge()).notes.map((n) => n.title)).toEqual(['Secret'])
    const direct = await fetch(`${couchOrigin}/${space}`, { headers: { Authorization: basicAuth(bob) } })
    expect(direct.status).toBe(403)
  })

  it('only the owner can create users', async () => {
    const bob = await newUser()
    const auth = browserAuth()
    await auth.signIn(bob.name, bob.password)
    await expect(auth.createUser(`user-${crypto.randomUUID().slice(0, 8)}`, 'pw')).rejects.toThrow(/owner/i)
  })

  it('creating a user whose name is taken fails', async () => {
    const alice = await newUser()
    await expect(ownerAuth().createUser(alice.name, 'another')).rejects.toThrow(/already exists/i)
  })

  it('the owner signs in as the server admin and gets a personal space too', async () => {
    const auth = browserAuth()
    const owner = await auth.signIn(ownerCredentials.name, ownerCredentials.password)
    expect(owner).toEqual({
      name: ownerCredentials.name,
      isOwner: true,
      personalSpaceId: personalSpaceId(ownerCredentials.name),
    })

    const { devices, converge } = await joinSpace(owner.personalSpaceId, basicAuth(ownerCredentials), 2)
    const id = await devices[0].space.createNote({ title: `Owner note ${crypto.randomUUID()}` })
    expect((await converge()).notes.map((n) => n.id)).toContain(id)
  })

  it('personal space names are valid database names, even for unusual user names', () => {
    for (const name of ['Alice', 'bob smith', 'Zoë', '1st-user']) {
      expect(personalSpaceId(name)).toMatch(/^[a-z][a-z0-9_$()+/-]*$/)
    }
    expect(personalSpaceId('Alice')).not.toBe(personalSpaceId('alice'))
  })
})
