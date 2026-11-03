# Notes stored as an append-only log of Yjs updates

Each note is a Yjs document, and it is persisted as an append-only log of small update documents (keyed by note ID, device ID, and a per-device sequence) instead of a single document holding the note's current content. Update documents are never modified after they're written, so CouchDB never sees a revision conflict, and Yjs does all the merging on each device. This is what lets offline edits from any number of devices converge to identical state without losing text.

## Considered Options

- **One CouchDB document per note holding its Markdown.** Rejected: concurrent offline edits become CouchDB revision conflicts, which pick a winner and hide the loser's text unless the app writes its own merge logic.
- **One CouchDB document per note holding the full Yjs state, merged on conflict.** Rejected: every edit rewrites the whole document, conflicts still happen on every concurrent edit, and the app would have to detect and resolve them itself.

## Consequences

- The log grows with every edit batch, so clients periodically write **snapshot** documents holding the merged state and the set of updates they cover; covered updates may then be compacted. Compaction must stay correct while other clients are offline (convergence scenario S9).
- Snapshots are kept from day one, which gives version history something to build on later.
- The server only stores and relays updates; it never reads or merges note content. That keeps a single place (the storage module) where per-document encryption can be added later.
- Indexes such as titles, backlinks, tags, and search are derived locally from Yjs state and never synced.
- Deletes are a flag in the note's Yjs metadata, never a CouchDB hard delete, so a concurrent edit to a deleted note still lands in the trashed copy.
