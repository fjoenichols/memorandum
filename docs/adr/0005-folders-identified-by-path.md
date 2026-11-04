# Folders are identified by their path, not a stable ID

A folder is identified by its path (such as `Recipes/Desserts`), and each note stores the path of the folder it's in, matching how Obsidian and an exported vault see folders. A space also keeps a list of its folders, so empty folders exist and sync. Renaming or moving a folder rewrites the path on every note and subfolder inside it. Notes, unlike folders, have a permanent note ID, because links and history depend on it; nothing refers to a folder except by path.

## Considered Options

- **Folders with stable IDs, notes referring to a folder ID.** Rejected for v1: a rename becomes one small change and offline edits always follow the folder, but two devices concurrently moving folders into each other can create a cycle, which needs its own resolution rule and tests. The extra machinery isn't worth it for a family-scale app.

## Consequences

- A note created offline in a folder that another device renamed or moved keeps the old path. After sync the old folder reappears in the tree holding that note, next to the renamed folder. Nothing is lost, every device agrees, and the user can move the note across. This is tested.
- Two devices moving the same note to different folders converge on one folder, the same on every device.
- A folder's existence is the union of the space's folder list and the folders notes point to, so a folder with notes can't silently vanish.
- Export maps directly: a folder path is a directory path in the vault.
- If the reappearing-folder case turns out to confuse people in practice, switching to stable folder IDs means migrating every note's folder field; revisit this ADR rather than patching around it.
