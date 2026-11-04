import { setupCouchDb } from '../scripts/setup-couchdb'

/** Makes sure the CouchDB the tests use is set up (users database, session settings). */
export default async function globalSetup() {
  await setupCouchDb()
}
