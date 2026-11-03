import { describe, expect, it } from 'vitest'

// Proves tests can reach a real CouchDB. Start one with `pnpm couchdb:up`.
const url = process.env.COUCHDB_URL ?? 'http://admin:password@localhost:5984'

function request(path: string, init?: RequestInit) {
  const { origin, username, password } = new URL(url)
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`)}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

describe('CouchDB', () => {
  it('is up', async () => {
    const res = await request('/_up')
    expect(res.status).toBe(200)
  })

  it('can create, write to, and delete a database', async () => {
    const db = `/test-${crypto.randomUUID()}`
    expect((await request(db, { method: 'PUT' })).status).toBe(201)
    try {
      const put = await request(`${db}/hello`, { method: 'PUT', body: JSON.stringify({ text: 'hi' }) })
      expect(put.status).toBe(201)
      const doc = (await (await request(`${db}/hello`)).json()) as { text: string }
      expect(doc.text).toBe('hi')
    } finally {
      await request(db, { method: 'DELETE' })
    }
  })
})
