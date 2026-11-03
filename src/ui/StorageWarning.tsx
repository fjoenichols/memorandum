import { useEffect, useState } from 'react'

/**
 * Asks the browser to keep this device's notes even when disk space runs low.
 * Shows a dismissible warning if the browser refuses or can't promise that.
 */
export function StorageWarning() {
  const [atRisk, setAtRisk] = useState(false)

  useEffect(() => {
    let cancelled = false
    requestPersistentStorage().then((persisted) => {
      if (!cancelled) setAtRisk(!persisted)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!atRisk) return null
  return (
    <aside className="banner banner-warning" aria-label="Storage warning">
      <p>
        This browser may clear notes stored on this device when it runs low on space. Notes that have synced are
        safe on the server. Installing the app usually fixes this.
      </p>
      <button type="button" onClick={() => setAtRisk(false)}>
        Dismiss
      </button>
    </aside>
  )
}

/** True if the browser promises to keep our storage. Unsupported counts as no. */
async function requestPersistentStorage(): Promise<boolean> {
  const storage = navigator.storage as StorageManager | undefined
  if (!storage?.persist) return false
  try {
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}
