import { useState, type FormEvent } from 'react'
import { SignInError, type AuthAdapter, type AuthUser } from '../core'

export function SignIn({ auth, onSignedIn }: { auth: AuthAdapter; onSignedIn: (user: AuthUser) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      onSignedIn(await auth.signIn(name.trim(), password))
    } catch (err) {
      setError(err instanceof SignInError ? err.message : "Couldn't reach the server. Check your connection and try again.")
      setBusy(false)
    }
  }

  return (
    <main className="sign-in">
      <form onSubmit={submit} aria-label="Sign in">
        <h2>Sign in</h2>
        <label>
          User name
          <input autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
    </main>
  )
}
