import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Space } from '../core'

/** Every folder path in the space, sorted, re-rendering only when the list changes. */
export function useFolders(space: Space): string[] {
  const subscribe = useCallback((onChange: () => void) => space.subscribe(onChange), [space])
  const serialized = useSyncExternalStore(subscribe, () => JSON.stringify(space.listFolders()))
  return useMemo(() => JSON.parse(serialized) as string[], [serialized])
}
