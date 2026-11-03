interface ImportMetaEnv {
  /** CouchDB base URL to sync with. Unset means local-only. */
  readonly VITE_COUCHDB_URL?: string
}

/** Identifies the deploy this bundle came from (VITE_BUILD_ID, or the build time). */
declare const __BUILD_ID__: string
