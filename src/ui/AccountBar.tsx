import type { AuthUser } from '../core'

export function AccountBar({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  return (
    <div className="account">
      <span>Signed in as {user.name}</span>
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
