import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { TRASH_RETENTION_MS, type Space, type TrashedNote } from '../core'

function useTrash(space: Space): TrashedNote[] {
  const subscribe = useCallback((onChange: () => void) => space.subscribe(onChange), [space])
  // A string snapshot compares by value, so unrelated edits don't re-render.
  const serialized = useSyncExternalStore(subscribe, () => JSON.stringify(space.listTrash()))
  return useMemo(() => JSON.parse(serialized) as TrashedNote[], [serialized])
}

const DAY = 24 * 60 * 60 * 1000

/** The space's trash: restore notes, or delete them forever. */
export function Trash({ space }: { space: Space }) {
  const notes = useTrash(space)
  const [open, setOpen] = useState(false)
  // Read the clock when the panel opens; "days left" doesn't need to tick.
  const [openedAt, setOpenedAt] = useState(0)
  const [error, setError] = useState<string>()

  async function attempt(action: () => Promise<void>) {
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="trash">
      <button type="button" className="trash-toggle" aria-expanded={open} onClick={() => {
          setOpenedAt(Date.now())
          setOpen(!open)
        }}
      >
        Trash ({notes.length})
      </button>
      {open && (
        <section aria-label="Trash">
          <p className="hint">Notes here are deleted for good after 30 days.</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notes.length === 0 ? (
            <p className="hint">Trash is empty.</p>
          ) : (
            <ul>
              {notes.map((note) => {
                const daysLeft = Math.max(0, Math.ceil((note.deletedAt + TRASH_RETENTION_MS - openedAt) / DAY))
                return (
                  <li key={note.id} className="trash-item">
                    <span className="trash-title">{note.title}</span>
                    <span className="hint">
                      {note.folder ? `in ${note.folder} · ` : ''}
                      {daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
                    </span>
                    <span className="row-actions">
                      <button type="button" aria-label={`Restore ${note.title}`} onClick={() => attempt(() => space.restoreNote(note.id))}>
                        Restore
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${note.title} forever`}
                        onClick={() => {
                          if (window.confirm(`Delete "${note.title}" forever? This can't be undone.`)) {
                            void attempt(() => space.purgeNote(note.id))
                          }
                        }}
                      >
                        Delete forever
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
