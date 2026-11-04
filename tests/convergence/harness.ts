import PouchDB from 'pouchdb-core'
import HttpAdapter from 'pouchdb-adapter-http'
import MemoryAdapter from 'pouchdb-adapter-memory'
import Replication from 'pouchdb-replication'
import { expect, onTestFinished } from 'vitest'
import { createCore, type Core, type CoreOptions, type Space } from '../../src/core'

PouchDB.plugin(MemoryAdapter).plugin(HttpAdapter).plugin(Replication)

const couchUrl = new URL(process.env.COUCHDB_URL ?? 'http://admin:password@localhost:5984')

/** What every device must agree on after sync. */
export interface DeviceState {
  notes: { id: string; title: string; body: string }[]
  /** Every folder path in the space, sorted. */
  folders: string[]
  /** Each note's folder path ('' is the top level), by note ID. */
  noteFolders: Record<string, string>
}

export interface Device {
  readonly core: Core
  readonly space: Space
  goOnline(): void
  goOffline(): void
  state(): DeviceState
  /** Closes the device and reopens it from its local storage, staying offline. */
  restart(): Promise<void>
}

export interface Harness {
  devices: [Device, Device, ...Device[]]
  /** Bring every device online and wait until they all hold identical state. */
  converge(): Promise<DeviceState>
  /** Adds a new device with empty storage, online. It joins `devices`. */
  addDevice(): Promise<Device>
}

/** Core options a test can override for every device. */
export type HarnessOptions = Pick<CoreOptions, 'snapshotEvery'>

function authHeader() {
  const user = decodeURIComponent(couchUrl.username)
  const pass = decodeURIComponent(couchUrl.password)
  return `Basic ${btoa(`${user}:${pass}`)}`
}

async function couch(path: string, method: string) {
  const res = await fetch(`${couchUrl.origin}/${path}`, { method, headers: { Authorization: authHeader() } })
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
}

/**
 * Creates a fresh space on the real CouchDB and `count` simulated devices,
 * each with its own in-memory PouchDB, all starting online.
 */
export async function createHarness(count = 2, options: HarnessOptions = {}): Promise<Harness> {
  if (count < 2) throw new Error('A convergence test needs at least two devices')
  const spaceId = `test-${crypto.randomUUID()}`
  await couch(spaceId, 'PUT')

  const open = () => openDevice(spaceId, `device-${crypto.randomUUID()}`, options)
  const devices: Harness['devices'] = [await open(), await open()]
  for (let i = 2; i < count; i++) devices.push(await open())

  onTestFinished(async () => {
    for (const d of devices) await d.core.close()
    await couch(spaceId, 'DELETE')
  })

  return {
    devices,
    async converge() {
      for (const d of devices) d.goOnline()
      await expect
        .poll(() => devices.map((d) => JSON.stringify(d.state())), { timeout: 20_000, interval: 100 })
        .toSatisfy((states: string[]) => states.every((s) => s === states[0]))
      return devices[0].state()
    },
    async addDevice() {
      const device = await open()
      devices.push(device)
      return device
    },
  }
}

/**
 * Opens `count` devices on an existing space, syncing as a particular user
 * (an `Authorization` header value). The space itself is left in place.
 */
export async function joinSpace(
  spaceId: string,
  authorization: string,
  count = 1,
  options: HarnessOptions = {},
): Promise<{ devices: [Device, ...Device[]]; converge(): Promise<DeviceState> }> {
  return joinSpaceAs(spaceId, [authorization, ...Array<string>(Math.max(0, count - 1)).fill(authorization)], options)
}

/**
 * Opens one device per authorization on an existing space, so devices of
 * different members (each syncing as that user) can converge together.
 */
export async function joinSpaceAs(
  spaceId: string,
  authorizations: [string, ...string[]],
  options: HarnessOptions = {},
): Promise<{ devices: [Device, ...Device[]]; converge(): Promise<DeviceState> }> {
  const [first, ...rest] = authorizations
  const open = (authorization: string) => openDevice(spaceId, `device-${crypto.randomUUID()}`, options, authorization)
  const devices: [Device, ...Device[]] = [await open(first)]
  for (const authorization of rest) devices.push(await open(authorization))
  onTestFinished(async () => {
    for (const d of devices) await d.core.close()
  })
  return {
    devices,
    async converge() {
      for (const d of devices) d.goOnline()
      await expect
        .poll(() => devices.map((d) => JSON.stringify(d.state())), { timeout: 20_000, interval: 100 })
        .toSatisfy((states: string[]) => states.every((s) => s === states[0]))
      return devices[0].state()
    },
  }
}

async function openDevice(
  spaceId: string,
  deviceId: string,
  options: HarnessOptions,
  authorization = authHeader(),
): Promise<Device> {
  const start = async (online: boolean) => {
    const core = createCore({
      ...options,
      deviceId,
      openLocal: (name) => new PouchDB(`${deviceId}-${name}`, { adapter: 'memory' }),
      openRemote: (name) =>
        new PouchDB(`${couchUrl.origin}/${name}`, {
          skip_setup: true,
          fetch: (url, opts) => {
            const headers = new Headers(opts?.headers)
            headers.set('Authorization', authorization)
            return PouchDB.fetch(url, { ...opts, headers })
          },
        }),
    })
    core.setOnline(online)
    return { core, space: await core.openSpace(spaceId) }
  }

  let current = await start(true)
  return {
    get core() {
      return current.core
    },
    get space() {
      return current.space
    },
    goOnline: () => current.core.setOnline(true),
    goOffline: () => current.core.setOnline(false),
    state: () => stateOf(current.space),
    async restart() {
      await current.core.close()
      current = await start(false)
    },
  }
}

function stateOf(space: Space): DeviceState {
  const notes = space
    .listNotes()
    .map((n) => ({ id: n.id, title: n.title, body: space.readNote(n.id).body }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const noteFolders = Object.fromEntries(
    space
      .listNotes()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => [n.id, n.folder]),
  )
  return { notes, folders: space.listFolders(), noteFolders }
}
