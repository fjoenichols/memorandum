import { useCallback, useSyncExternalStore } from 'react'
import type { Space } from '../core'

/** Whether this device still has changes in the space that aren't stored yet. */
export function useHasUnsavedChanges(space: Space): boolean {
  const subscribe = useCallback((onChange: () => void) => space.subscribe(onChange), [space])
  return useSyncExternalStore(subscribe, () => space.hasUnsavedChanges())
}
