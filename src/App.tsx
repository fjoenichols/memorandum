import { useEffect, useMemo, useState } from 'react'
import type { AuthUser } from './core'
import { createBrowserAuth, rememberedUser } from './core/browser'
import { AccountBar } from './ui/AccountBar'
import { CreateUser } from './ui/CreateUser'
import { SignIn } from './ui/SignIn'
import { SpaceScreen } from './ui/SpaceScreen'
import { StorageWarning } from './ui/StorageWarning'
import { UpdatePrompt } from './ui/UpdatePrompt'

type Session = { status: 'checking' } | { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser }

export function App() {
  const auth = useMemo(() => createBrowserAuth(), [])
  const [session, setSession] = useState<Session>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    auth.currentUser().then(
      (user) => {
        if (cancelled) return
        rememberedUser.set(user)
        setSession(user ? { status: 'signed-in', user } : { status: 'signed-out' })
      },
      () => {
        // The server can't be reached: open the last user's notes offline.
        // Sync resumes on its own when the connection returns.
        if (cancelled) return
        const user = rememberedUser.get()
        setSession(user ? { status: 'signed-in', user } : { status: 'signed-out' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [auth])

  function signedIn(user: AuthUser) {
    rememberedUser.set(user)
    setSession({ status: 'signed-in', user })
  }

  async function signOut() {
    try {
      await auth.signOut()
    } catch {
      // Offline: the server session expires on its own; forget it here regardless.
    }
    rememberedUser.set(null)
    setSession({ status: 'signed-out' })
  }

  return (
    <>
      <header className="header">
        <h1>Memorandum</h1>
        {session.status === 'signed-in' && <AccountBar user={session.user} onSignOut={signOut} />}
      </header>
      <UpdatePrompt />
      <StorageWarning />
      {session.status === 'checking' && <p>Loading…</p>}
      {session.status === 'signed-out' && <SignIn auth={auth} onSignedIn={signedIn} />}
      {session.status === 'signed-in' && (
        <>
          {session.user.isOwner && <CreateUser auth={auth} />}
          <SpaceScreen key={session.user.personalSpaceId} spaceId={session.user.personalSpaceId} />
        </>
      )}
    </>
  )
}
