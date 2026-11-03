import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { NoteSummary, Space } from '../core'

/** The space's notes, sorted by title, re-rendering only when the list changes. */
export function useNotes(space: Space): NoteSummary[] {
  const subscribe = useCallback((onChange: () => void) => space.subscribe(onChange), [space])
  // A string snapshot compares by value, so edits to note bodies don't re-render the list.
  const serialized = useSyncExternalStore(subscribe, () =>
    JSON.stringify(space.listNotes().sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))),
  )
  return useMemo(() => JSON.parse(serialized) as NoteSummary[], [serialized])
}
