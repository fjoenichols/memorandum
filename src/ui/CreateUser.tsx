import { useState, type FormEvent } from 'react'
import type { AuthAdapter } from '../core'

/** For the owner: creates a family member's account and personal space. */
export function CreateUser({ auth }: { auth: AuthAdapter }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const userName = name.trim()
    try {
      await auth.createUser(userName, password)
      setMessage({ ok: true, text: `Created ${userName}. They can sign in now.` })
      setName('')
      setPassword('')
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <details className="create-user">
      <summary>Create a user</summary>
      <form onSubmit={submit}>
        <input
          aria-label="New user name"
          placeholder="User name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          aria-label="New user password"
          placeholder="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Create user</button>
      </form>
      {message && <p role={message.ok ? undefined : 'alert'}>{message.text}</p>}
    </details>
  )
}
