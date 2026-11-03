import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Registers the service worker and offers new versions to the user. The app
 * never reloads on its own: a new version waits until the user accepts it.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      // Installed apps can stay open for days; check for deploys hourly too.
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) return null
  return (
    <aside className="banner banner-info" aria-label="Update available">
      <p>A new version of Memorandum is available.</p>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Update now
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </aside>
  )
}
