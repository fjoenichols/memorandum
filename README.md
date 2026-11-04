# Memorandum

An offline-first, Obsidian-compatible notes app for the family. See `docs/prd/notes-app-v1.md` for the product plan, `GLOSSARY.md` for vocabulary, and `docs/adr/` for key decisions.

## Development

Requires Node 24+, pnpm, and Docker.

```sh
pnpm install
pnpm couchdb:up     # local CouchDB at http://localhost:5984 (admin / password), then runs couchdb:setup
pnpm dev            # app at http://localhost:5173; sign in as admin / password
```

`pnpm couchdb:setup` (safe to repeat) creates CouchDB's `_users` database and keeps sign-ins alive for 30 days. Run it once against any new CouchDB, with `COUCHDB_URL` pointing at it.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test           # Vitest, including tests against the real CouchDB (run couchdb:up first)
pnpm test:e2e       # Playwright against a production build with the service worker
```

CI runs all four on every push and pull request, with CouchDB as a service container.

Tests that need CouchDB read `COUCHDB_URL` (default `http://admin:password@localhost:5984`).

## Accounts and sync

- **The owner is the CouchDB server admin** (`COUCHDB_USER` / `COUCHDB_PASSWORD` in Docker). Sign in to the app with those credentials.
- **Creating users:** the owner opens **Create a user** in the app and picks a user name and password. That creates the account and the user's personal space. Nobody can sign themselves up.
- **Personal spaces:** each user gets one CouchDB database, `userdb-<user name in hex>`, whose security settings list only that user. The owner's personal space is created on their first sign-in.
- **Shared spaces:** only the owner creates them, from **Shared spaces** in the app (creating a CouchDB database needs admin rights and there's no app server). Each one is a database named `shared-<random hex>`; its display name is stored in the database's security settings, where every member can read it.
- **Members:** the owner adds and removes members under **Shared spaces**. Membership is a CouchDB role on the user's account, `space:<database name>`, and each shared space admits exactly that role, so the role is the single source of truth. Devices learn their spaces from the user's own session and check again on launch, on window focus, and every minute. A removed member loses access within moments; their device stops syncing that space and hides it, but keeps its local copy. The owner can open every shared space.
- **Switching spaces:** the **Space** picker at the top of the sidebar. Every space a user belongs to keeps syncing in the background, not just the one on screen.
- **Same origin:** the app talks to CouchDB at `/couch` on its own origin, so sign-in cookies work without CORS. `vite dev` and `vite preview` proxy `/couch` to `COUCHDB_PROXY_TARGET` (default `http://localhost:5984`); Caddy does the same in production.
- **Offline:** the last signed-in user's notes open without a network, and sync resumes when the connection returns.

## Code layout

- `src/core/`: the core API. Storage, sync, Yjs notes, and the editor binding live here and nowhere else (enforced by lint).
- `src/features/`: feature modules (for example `links/` for wikilinks), using only the core API. Anything they index is derived locally and never synced.
- `src/ui/`: React UI, using only the core API and feature modules.
- `tests/convergence/`: the multi-device harness and scenarios S1–S11 against real CouchDB. Never weaken or skip these.
