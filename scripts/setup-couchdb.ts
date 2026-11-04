/**
 * One-time (and safe to repeat) CouchDB setup for Memorandum.
 *
 *   COUCHDB_URL=http://admin:password@localhost:5984 node scripts/setup-couchdb.ts
 *
 * The CouchDB server admin in COUCHDB_URL is the app's owner.
 */

/** How long a sign-in lasts without any requests (CouchDB refreshes it on use). */
const SESSION_SECONDS = 60 * 60 * 24 * 30

export async function setupCouchDb(couchUrl = process.env.COUCHDB_URL ?? 'http://admin:password@localhost:5984') {
  const url = new URL(couchUrl)
  const auth = `Basic ${btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`
  const put = async (path: string, body?: unknown) => {
    const res = await fetch(`${url.origin}${path}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // 412: the database already exists.
    if (!res.ok && res.status !== 412) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`)
  }

  // The users database. In CouchDB 3 only admins can read or write it, so
  // nobody can sign themselves up; the owner creates every account.
  await put('/_users')
  // Keep people signed in, including across browser restarts.
  await put('/_node/_local/_config/chttpd_auth/timeout', String(SESSION_SECONDS))
  await put('/_node/_local/_config/chttpd_auth/allow_persistent_cookies', 'true')
}

if (import.meta.main) {
  await setupCouchDb()
  console.log('CouchDB is set up.')
}
