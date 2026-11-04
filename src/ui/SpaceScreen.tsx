import { useEffect, useRef, useState } from 'react'
import type { AuthAdapter, AuthUser, Core, Space, SpaceRef } from '../core'
import { createBrowserCore, rememberedSpaces } from '../core/browser'
import { NotesScreen } from './NotesScreen'
import { SpaceSwitcher } from './SpaceSwitcher'

/** How often to check for spaces the user was added to or removed from. */
const REFRESH_MS = 60_000

interface Props {
  user: AuthUser
  auth: AuthAdapter
  /** Changes whenever the owner changes shared spaces, to check again right away. */
  refreshKey?: number
}

/**
 * Opens every space the user belongs to on this device and keeps them all
 * syncing, showing one at a time.
 */
export function SpaceScreen({ user, auth, refreshKey = 0 }: Props) {
  // Closing the core only closes the spaces open at the time, so the same core
  // can reopen them (React's development double-mount does exactly that).
  const [core] = useState<Core>(createBrowserCore)
  const [refs, setRefs] = useState<SpaceRef[]>(
    () => rememberedSpaces.get(user.name) ?? [{ id: user.personalSpaceId, name: 'Personal', kind: 'personal' }],
  )
  const [opened, setOpened] = useState<Record<string, Space>>({})
  const [currentId, setCurrentId] = useState(user.personalSpaceId)
  const [error, setError] = useState<string>()
  const openIds = useRef(new Set<string>())

  useEffect(
    () => () => {
      openIds.current = new Set()
      void core.close()
    },
    [core],
  )

  // Find out which spaces the user belongs to now.
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const latest = await auth.currentUser()
        if (!latest || cancelled) return
        const spaces = await auth.spacesOf(latest)
        if (cancelled) return
        rememberedSpaces.set(user.name, spaces)
        setRefs((previous) => (JSON.stringify(previous) === JSON.stringify(spaces) ? previous : spaces))
      } catch {
        // Offline or the server is unreachable: keep the spaces we know about.
      }
    }
    void refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [auth, user.name, refreshKey])

  // Keep every one of those spaces open and syncing; close ones the user left.
  useEffect(() => {
    let cancelled = false
    const wanted = new Set(refs.map((r) => r.id))
    // A removed member's copy stays on this device; it just stops syncing and showing.
    for (const id of openIds.current) if (!wanted.has(id)) void core.closeSpace(id)
    openIds.current = wanted
    Promise.all(refs.map(async (ref) => [ref.id, await core.openSpace(ref.id)] as const)).then(
      (entries) => {
        if (!cancelled) setOpened(Object.fromEntries(entries))
      },
      (err: unknown) => {
        if (!cancelled) setError(String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [core, refs])

  const shownId = refs.some((r) => r.id === currentId) ? currentId : user.personalSpaceId
  const space = opened[shownId]

  if (error) return <p role="alert">Couldn't open your notes: {error}</p>
  if (!space) return <p>Loading…</p>
  return (
    <NotesScreen
      key={shownId}
      space={space}
      sidebarHeader={<SpaceSwitcher spaces={refs} current={shownId} onChange={setCurrentId} />}
    />
  )
}
