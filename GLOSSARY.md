# Memorandum

An offline-first notes app for one family that syncs across their devices and keeps notes in Obsidian-flavored Markdown.

## Language

### People and spaces

**User**:
A person who can sign in to the app.
_Avoid_: Account, login

**Owner**:
The user who runs the app, creates the other users, and manages who belongs to which shared space.
_Avoid_: Admin, superuser

**Space**:
A named collection of notes that is shared, synced, and exported as one unit.
_Avoid_: Vault, workspace, notebook

**Personal space**:
The one space each user has that only they can see.
_Avoid_: Private space, home

**Shared space**:
A space created by a user whose members can all read and edit its notes.
_Avoid_: Family space, group, team

**Member**:
A user who has access to a particular shared space.
_Avoid_: Collaborator, participant

**Device**:
One installed copy of the app on a phone or computer, holding a full local copy of every space its user belongs to.
_Avoid_: Client, replica

### Notes and organization

**Note**:
A single piece of Markdown writing with a title, belonging to exactly one space.
_Avoid_: Document, page, file

**Note ID**:
The permanent, hidden identity of a note, unchanged by renames or folder moves.
_Avoid_: Key, slug

**Title**:
The visible name of a note, unique within its folder.
_Avoid_: Name, filename

**Folder**:
A path inside a space that groups notes.
_Avoid_: Directory, collection

**Title collision**:
Two notes in the same folder that ended up with the same title, both kept, one shown with a numeric suffix.
_Avoid_: Duplicate, conflict

**Move**:
Changing a note's folder within its space.
_Avoid_: Relocate

**Move to space**:
Taking a note out of one space and into another, which gives it a new note ID and leaves the original in the source space's trash.
_Avoid_: Transfer, share

### Linking and metadata

**Wikilink**:
A `[[Title]]` reference from one note to another note in the same space.
_Avoid_: Internal link, reference

**Backlink**:
A wikilink seen from the note it points to.
_Avoid_: Inbound link, mention

**Tag**:
A `#label` (optionally nested as `#parent/child`) attached to a note.
_Avoid_: Category, label

**Frontmatter**:
The YAML block at the top of a note holding its properties.
_Avoid_: Metadata, header, properties block

### Lifecycle

**Trash**:
The per-space holding area for deleted notes, from which they can be restored.
_Avoid_: Bin, recycle bin, archive

**Delete**:
Putting a note in its space's trash.
_Avoid_: Remove

**Restore**:
Taking a note back out of the trash.
_Avoid_: Undelete, recover

**Purge**:
Permanently removing a note from the trash, by the user or automatically after 30 days.
_Avoid_: Permanent delete, hard delete, erase

### Sync and export

**Sync**:
Exchanging changes between a device and the server for each space the user belongs to.
_Avoid_: Replication, backup

**Convergence**:
The state where every device holds identical notes after sync completes, with no text anyone typed lost.
_Avoid_: Consistency, agreement

**Sync status**:
What a device reports about a space's sync: synced, syncing, offline, or error.
_Avoid_: Connection state

**Export**:
Writing a space out as a folder of Markdown files that opens as an Obsidian vault.
_Avoid_: Download, backup

**Vault**:
The Obsidian-compatible folder produced by exporting a space; never a name for a space inside the app.
_Avoid_: Archive, dump
