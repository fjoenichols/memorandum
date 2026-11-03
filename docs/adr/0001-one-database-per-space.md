# One CouchDB database per space

A space (a user's personal space or a shared family space) is the unit of sharing, sync, and export, so each space gets its own CouchDB database on the server and its own PouchDB database on each device. CouchDB permissions are per database, not per document, so a database per space lets each space's security settings list exactly its members, lets replication run independently per space, and makes export a matter of dumping one database. Adding family members or new shared spaces later needs no data migration.

## Considered Options

- **One database for everyone, filtered by space.** Rejected: CouchDB can't enforce per-document read access, so every device would replicate everyone's notes and privacy would rest on client-side filtering.
- **One database per user.** Rejected: shared notes would have to be copied into every member's database and kept in step, which is exactly the sync problem the app exists to avoid.

## Consequences

- A note belongs to exactly one space. Moving a note to another space copies it into the target database with a new note ID and deletes the original into the source space's trash; it can't be a simple field change.
- Wikilinks resolve only within a space; cross-space links are out of scope.
- Search across all spaces has to query each space's local index and combine the results.
- The number of databases grows with users and shared spaces, which is fine at family scale.
