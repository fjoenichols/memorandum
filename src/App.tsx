import { useEffect, useState } from 'react'
import type { Space } from './core'
import { createBrowserCore } from './core/browser'
import { NotesScreen } from './ui/NotesScreen'
import { StorageWarning } from './ui/StorageWarning'
import { UpdatePrompt } from './ui/UpdatePrompt'

// Until sign-in and spaces exist, every device uses one local space.
const SPACE_ID = 'space-local'

export function App() {
  const [space, setSpace] = useState<Space>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const core = createBrowserCore(import.meta.env.VITE_COUCHDB_URL)
    core.openSpace(SPACE_ID).then(setSpace, (err: unknown) => setError(String(err)))
    return () => void core.close()
  }, [])

  return (
    <>
      <header className="header">
        <h1>Memorandum</h1>
      </header>
      <UpdatePrompt />
      <StorageWarning />
      {error ? <p role="alert">Couldn't open your notes: {error}</p> : space ? <NotesScreen space={space} /> : <p>Loading…</p>}
    </>
  )
}
