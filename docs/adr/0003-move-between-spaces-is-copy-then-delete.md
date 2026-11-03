# Moving a note to another space is copy-then-delete with a new note ID

Because each space is its own database (ADR-0001), a note can't change spaces by editing a field. Moving a note to another space instead creates a copy in the target space with a **new note ID**, then deletes the original into the source space's trash. The note ID is otherwise permanent, so this is the one operation where a note gets a new identity.

## Considered Options

- **Keep the same note ID in the target space.** Rejected: if another device edits the original while it's being moved, both spaces would hold diverging notes with the same ID, and a later move back would merge two histories that were never meant to merge.
- **Hard-delete the original after copying.** Rejected: sync never hard-deletes (ADR-0002). Edits made to the original on an offline device would vanish.

## Consequences

- Edits made to the original concurrently with the move land in the trashed original, not the copy (convergence scenario S7). The user can recover them from the source space's trash.
- Wikilinks to the note from its old space stop resolving, since links never cross spaces. Links inside the moved note now resolve against the target space.
- The copy starts a fresh edit history; the original's history stays with the trashed original until it's purged.
