import { useEffect, useState } from 'react'
import type { Space } from '../core'
import { createBrowserCore } from '../core/browser'
import { NotesScreen } from './NotesScreen'

/** Opens a space on this device, syncing it with the server, and shows its notes. */
export function SpaceScreen({ spaceId }: { spaceId: string }) {
  const [space, setSpace] = useState<Space>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const core = createBrowserCore()
    core.openSpace(spaceId).then(setSpace, (err: unknown) => setError(String(err)))
    return () => void core.close()
  }, [spaceId])

  if (error) return <p role="alert">Couldn't open your notes: {error}</p>
  return space ? <NotesScreen space={space} /> : <p>Loading…</p>
}
