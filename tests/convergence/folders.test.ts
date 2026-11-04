import { describe, expect, it } from 'vitest'
import { createHarness } from './harness'

describe('folders', () => {
  it('folders created on one device, including nested ones, appear on another', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Recipes/Desserts')
    await a.space.createFolder('Work')

    const state = await converge()
    expect(state.folders).toEqual(['Recipes', 'Recipes/Desserts', 'Work'])
  })

  it('a note can be created in a folder', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Recipes')
    const id = await a.space.createNote({ title: 'Pancakes', folder: 'Recipes' })

    const state = await converge()
    expect(state.noteFolders).toEqual({ [id]: 'Recipes' })
  })

  it('renaming and moving a note keeps its note ID', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Archive')
    const id = await a.space.createNote({ title: 'Groceries' })
    await a.space.editBody(id, { index: 0, insert: 'milk' })

    await a.space.renameNote(id, 'Shopping')
    await a.space.moveNote(id, 'Archive')

    const state = await converge()
    expect(state.notes).toEqual([{ id, title: 'Shopping', body: 'milk' }])
    expect(state.noteFolders).toEqual({ [id]: 'Archive' })
  })

  it('renaming a folder moves its notes and subfolders with it', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Recipes/Desserts')
    const pie = await a.space.createNote({ title: 'Pie', folder: 'Recipes/Desserts' })
    const soup = await a.space.createNote({ title: 'Soup', folder: 'Recipes' })

    await a.space.renameFolder('Recipes', 'Cooking')

    const state = await converge()
    expect(state.folders).toEqual(['Cooking', 'Cooking/Desserts'])
    expect(state.noteFolders).toEqual({ [pie]: 'Cooking/Desserts', [soup]: 'Cooking' })
  })

  it('moving a folder moves its notes and subfolders with it', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Recipes/Desserts')
    await a.space.createFolder('Archive')
    const pie = await a.space.createNote({ title: 'Pie', folder: 'Recipes/Desserts' })

    await a.space.moveFolder('Recipes', 'Archive')

    const state = await converge()
    expect(state.folders).toEqual(['Archive', 'Archive/Recipes', 'Archive/Recipes/Desserts'])
    expect(state.noteFolders).toEqual({ [pie]: 'Archive/Recipes/Desserts' })
  })

  it('a folder cannot be moved into itself or one of its subfolders', async () => {
    const { devices } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Recipes/Desserts')

    await expect(a.space.moveFolder('Recipes', 'Recipes/Desserts')).rejects.toThrow()
    await expect(a.space.moveFolder('Recipes', 'Recipes')).rejects.toThrow()
    expect(a.space.listFolders()).toEqual(['Recipes', 'Recipes/Desserts'])
  })

  it('deleting a folder removes it and its subfolders and puts their notes in trash', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Empty')
    await a.space.createFolder('Parent/Child')
    await a.space.createFolder('Kept')
    const inParent = await a.space.createNote({ title: 'In parent', folder: 'Parent' })
    const inChild = await a.space.createNote({ title: 'In child', folder: 'Parent/Child' })
    const kept = await a.space.createNote({ title: 'Elsewhere', folder: 'Kept' })

    await a.space.deleteFolder('Empty')
    await a.space.deleteFolder('Parent')

    const state = await converge()
    expect(state.folders).toEqual(['Kept'])
    expect(state.notes.map((n) => n.id)).toEqual([kept])
    expect(state.trash.map((n) => n.id).sort()).toEqual([inParent, inChild].sort())
  })

  it('renames and moves made offline on one device show up identically on the other', async () => {
    const { devices, converge } = await createHarness(2)
    const [a] = devices
    await a.space.createFolder('Inbox')
    await a.space.createFolder('Projects')
    const note = await a.space.createNote({ title: 'Draft', folder: 'Inbox' })
    await converge()

    a.goOffline()
    await a.space.renameNote(note, 'Plan')
    await a.space.moveNote(note, 'Projects')
    await a.space.renameFolder('Projects', 'Active')
    await a.space.moveFolder('Inbox', 'Active')

    const state = await converge()
    expect(state.notes.map((n) => n.title)).toEqual(['Plan'])
    expect(state.noteFolders).toEqual({ [note]: 'Active' })
    expect(state.folders).toEqual(['Active', 'Active/Inbox'])
  })

  it('two devices moving the same note offline to different folders converge on one', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    await a.space.createFolder('Left')
    await a.space.createFolder('Right')
    const note = await a.space.createNote({ title: 'Wanderer' })
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.moveNote(note, 'Left')
    await b.space.moveNote(note, 'Right')

    const state = await converge()
    expect(['Left', 'Right']).toContain(state.noteFolders[note])
  })

  it('a note added offline to a folder that another device renamed is kept', async () => {
    const { devices, converge } = await createHarness(2)
    const [a, b] = devices
    await a.space.createFolder('Old')
    await converge()

    a.goOffline()
    b.goOffline()
    await a.space.renameFolder('Old', 'New')
    const note = await b.space.createNote({ title: 'Late arrival', folder: 'Old' })

    const state = await converge()
    // Nothing is lost: the note keeps the folder it was created in, and that
    // folder still shows in the tree because a note lives there.
    expect(state.notes.map((n) => n.id)).toEqual([note])
    expect(state.noteFolders[note]).toBe('Old')
    expect(state.folders).toEqual(['New', 'Old'])
  })
})
