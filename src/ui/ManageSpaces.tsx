import { useEffect, useState, type FormEvent } from 'react'
import type { AuthAdapter, SharedSpaceInfo } from '../core'

interface Props {
  auth: AuthAdapter
  /** Called after any change, so open screens can pick it up. */
  onChanged: () => void
}

/** For the owner: creates shared spaces and manages who belongs to each. */
export function ManageSpaces({ auth, onChanged }: Props) {
  const [spaces, setSpaces] = useState<SharedSpaceInfo[]>([])
  const [users, setUsers] = useState<string[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  /** Bumped after each change to load the latest spaces and users. */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([auth.listSharedSpaces(), auth.listUsers()]).then(
      ([nextSpaces, nextUsers]) => {
        if (cancelled) return
        setSpaces(nextSpaces)
        setUsers(nextUsers)
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [auth, version])

  async function attempt(action: () => Promise<unknown>) {
    setError(undefined)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setVersion((v) => v + 1)
  }

  function create(event: FormEvent) {
    event.preventDefault()
    void attempt(async () => {
      await auth.createSharedSpace(name)
      setName('')
    })
  }

  return (
    <section className="manage-spaces" aria-label="Shared spaces">
      <details>
        <summary>Shared spaces</summary>
        <form onSubmit={create}>
          <input
            aria-label="New shared space name"
            placeholder="New shared space name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit">Create shared space</button>
        </form>
        {error && <p role="alert">{error}</p>}
        <ul>
          {spaces.map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              users={users}
              onAdd={(user) => attempt(() => auth.addMember(space.id, user))}
              onRemove={(user) => attempt(() => auth.removeMember(space.id, user))}
            />
          ))}
        </ul>
      </details>
    </section>
  )
}

interface RowProps {
  space: SharedSpaceInfo
  users: string[]
  onAdd: (user: string) => void
  onRemove: (user: string) => void
}

function SpaceRow({ space, users, onAdd, onRemove }: RowProps) {
  const candidates = users.filter((u) => !space.members.includes(u))
  const [picked, setPicked] = useState('')
  const choice = candidates.includes(picked) ? picked : (candidates[0] ?? '')

  return (
    <li>
      <strong>{space.name}</strong>
      <ul aria-label={`Members of ${space.name}`}>
        {space.members.length === 0 && <li className="hint">No members yet</li>}
        {space.members.map((member) => (
          <li key={member}>
            {member}{' '}
            <button type="button" aria-label={`Remove ${member} from ${space.name}`} onClick={() => onRemove(member)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="add-member">
          <select aria-label={`Add a member to ${space.name}`} value={choice} onChange={(e) => setPicked(e.target.value)}>
            {candidates.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => choice && onAdd(choice)}>
            Add member
          </button>
        </div>
      )}
    </li>
  )
}
