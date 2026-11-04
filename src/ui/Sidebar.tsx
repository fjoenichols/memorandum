import { useState, type FormEvent, type ReactNode } from 'react'
import type { NoteSummary, Space } from '../core'
import { Trash } from './Trash'
import { useFolders } from './useFolders'
import { useNotes } from './useNotes'

type Target = { type: 'note'; id: string; name: string } | { type: 'folder'; path: string; name: string }
type Editing = { action: 'rename' | 'move'; target: Target }

interface Props {
  space: Space
  selectedNote?: string
  onSelectNote: (id: string) => void
}

const TOP_LEVEL = ''

/** The current space's folder tree, with create, rename, move, and delete. */
export function Sidebar({ space, selectedNote, onSelectNote }: Props) {
  const notes = useNotes(space)
  const folders = useFolders(space)
  const [currentFolder, setCurrentFolder] = useState(TOP_LEVEL)
  const [editing, setEditing] = useState<Editing>()
  const [error, setError] = useState<string>()

  // A folder can vanish under us (renamed here or on another device).
  const folder = currentFolder === TOP_LEVEL || folders.includes(currentFolder) ? currentFolder : TOP_LEVEL

  /** Runs a core action, showing its error if it fails. Resolves to whether it succeeded. */
  async function attempt(action: () => Promise<unknown>): Promise<boolean> {
    setError(undefined)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  const childFolders = (parent: string) =>
    folders.filter((f) => f.split('/').slice(0, -1).join('/') === parent)
  const notesIn = (path: string) => notes.filter((n) => n.folder === path)

  function renderContents(path: string, label: string): ReactNode {
    return (
      <ul aria-label={`${label} contents`}>
        {childFolders(path).map((child) => {
          const name = child.split('/').at(-1) ?? child
          return (
            <li key={child}>
              <Row
                label={name}
                current={child === folder}
                onSelect={() => setCurrentFolder(child)}
                target={{ type: 'folder', path: child, name }}
                editing={editing}
                setEditing={setEditing}
                onDelete={() => attempt(() => space.deleteFolder(child))}
                moveOptions={[TOP_LEVEL, ...folders.filter((f) => f !== child && !f.startsWith(`${child}/`))]}
                onRename={(newName) => attempt(() => space.renameFolder(child, newName))}
                onMove={(into) => attempt(() => space.moveFolder(child, into))}
                isFolder
              />
              {renderContents(child, name)}
            </li>
          )
        })}
        {notesIn(path).map((note: NoteSummary) => (
          <li key={note.id}>
            <Row
              label={note.title}
              current={note.id === selectedNote}
              onSelect={() => onSelectNote(note.id)}
              target={{ type: 'note', id: note.id, name: note.title }}
              editing={editing}
              setEditing={setEditing}
              moveOptions={[TOP_LEVEL, ...folders]}
              onRename={(newName) => attempt(() => space.renameNote(note.id, newName))}
              onMove={(into) => attempt(() => space.moveNote(note.id, into))}
              onDelete={() => attempt(() => space.deleteNote(note.id))}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <nav className="sidebar" aria-label="Notes">
      <CreateForm
        label="New note title"
        button="Create note"
        onCreate={(title) =>
          attempt(async () => {
            onSelectNote(await space.createNote({ title, folder }))
          })
        }
      />
      <CreateForm
        label="New folder name"
        button="Create folder"
        onCreate={(name) => attempt(() => space.createFolder(folder ? `${folder}/${name}` : name))}
      />
      <p className="hint">New notes and folders go in: {folder || 'Top level'}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="button" className="row-label" aria-current={folder === TOP_LEVEL} onClick={() => setCurrentFolder(TOP_LEVEL)}>
        Top level
      </button>
      {renderContents(TOP_LEVEL, 'Top level')}
      <Trash space={space} />
    </nav>
  )
}

function CreateForm({ label, button, onCreate }: { label: string; button: string; onCreate: (value: string) => Promise<boolean> }) {
  const [value, setValue] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const submitted = value.trim()
    if (!submitted) return
    // Clear right away so anything typed while saving isn't wiped afterwards.
    setValue('')
    if (!(await onCreate(submitted))) setValue((current) => current || submitted)
  }
  return (
    <form onSubmit={submit}>
      <input aria-label={label} placeholder={label} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit">{button}</button>
    </form>
  )
}

interface RowProps {
  label: string
  current: boolean
  onSelect: () => void
  target: Target
  editing?: Editing
  setEditing: (editing?: Editing) => void
  moveOptions: string[]
  onRename: (name: string) => Promise<unknown>
  onMove: (into: string) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  isFolder?: boolean
}

function sameTarget(a: Target, b: Target) {
  return a.type === b.type && (a.type === 'note' ? a.id === (b as typeof a).id : a.path === (b as typeof a).path)
}

function Row({ label, current, onSelect, target, editing, setEditing, moveOptions, onRename, onMove, onDelete, isFolder }: RowProps) {
  const kind = isFolder ? 'folder' : 'note'
  const mode = editing && sameTarget(editing.target, target) ? editing.action : undefined
  const [name, setName] = useState(label)
  const [into, setInto] = useState(moveOptions[0] ?? '')

  if (mode === 'rename') {
    return (
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault()
          setEditing(undefined)
          if (name.trim() && name.trim() !== label) await onRename(name.trim())
        }}
      >
        <input
          aria-label={`New name for ${label}`}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(undefined)}
        />
      </form>
    )
  }

  return (
    <div className={`row ${isFolder ? 'folder' : 'note'}`}>
      <button type="button" className="row-label" aria-current={current} onClick={onSelect}>
        {isFolder && <span aria-hidden="true">📁 </span>}
        {label}
      </button>
      <span className="row-actions">
        <button
          type="button"
          aria-label={`Rename ${kind} ${label}`}
          title="Rename"
          onClick={() => {
            setName(label)
            setEditing({ action: 'rename', target })
          }}
        >
          ✎
        </button>
        <button type="button" aria-label={`Move ${kind} ${label}`} title="Move" onClick={() => setEditing({ action: 'move', target })}>
          ⇢
        </button>
        {onDelete && (
          <button type="button" aria-label={`Delete ${kind} ${label}`} title="Delete" onClick={() => void onDelete()}>
            🗑
          </button>
        )}
      </span>
      {mode === 'move' && (
        <form
          className="move-form"
          onSubmit={async (e) => {
            e.preventDefault()
            setEditing(undefined)
            await onMove(into)
          }}
        >
          <select aria-label={`Move ${label} to`} value={into} onChange={(e) => setInto(e.target.value)}>
            {moveOptions.map((option) => (
              <option key={option} value={option}>
                {option || 'Top level'}
              </option>
            ))}
          </select>
          <button type="submit">Move</button>
          <button type="button" onClick={() => setEditing(undefined)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
