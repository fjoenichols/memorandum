# Memorandum

An offline-first, Obsidian-compatible notes app for the family. See `docs/prd/notes-app-v1.md` for the product plan, `GLOSSARY.md` for vocabulary, and `docs/adr/` for key decisions.

## Development

Requires Node 24+, pnpm, and Docker.

```sh
pnpm install
pnpm dev            # app at http://localhost:5173
pnpm couchdb:up     # local CouchDB at http://localhost:5984 (admin / password)
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test           # Vitest, including tests against the real CouchDB (run couchdb:up first)
pnpm test:e2e       # Playwright against a production build with the service worker
```

CI runs all four on every push and pull request, with CouchDB as a service container.

Tests that need CouchDB read `COUCHDB_URL` (default `http://admin:password@localhost:5984`).
