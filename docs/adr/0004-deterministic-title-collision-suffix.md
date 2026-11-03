# Title collisions keep both notes and suffix one deterministically

Titles must be unique within a folder (they become file names on export, as in Obsidian), but two offline devices can create or rename notes to the same title in the same folder. When that happens both notes are kept, and the note that sorts later by **creation time, then note ID** gets a numeric suffix (such as "Groceries 1"). Every device computes the same answer from the same data, so they all agree without talking to each other or the server. The UI shows a duplicate-title badge until the user resolves the collision.

## Considered Options

- **Last write wins / merge the two notes.** Rejected: it loses or mixes up text someone typed, which breaks the app's overriding rule.
- **Reject the second title.** Rejected: there's no moment to reject anything; both devices were offline and each accepted its own title.
- **Let the server pick.** Rejected: the server only stores and relays updates (ADR-0002) and devices must converge without it.

## Consequences

- The suffix is derived when the title is shown, not stored as a separate rename, so it stays stable as notes sync and never fights with a real rename.
- If the user renames one note to clear the collision, the suffix and badge disappear on every device.
- Wikilinks to the shared title resolve to the unsuffixed note; links meant for the other note must be fixed by the user after resolving.
