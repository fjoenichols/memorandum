import type { SpaceRef } from '../core'

interface Props {
  spaces: SpaceRef[]
  current: string
  onChange: (spaceId: string) => void
}

/** Picks which space the sidebar and editor show. */
export function SpaceSwitcher({ spaces, current, onChange }: Props) {
  return (
    <label className="space-switcher">
      <span>Space</span>
      <select aria-label="Space" value={current} onChange={(e) => onChange(e.target.value)}>
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name}
          </option>
        ))}
      </select>
    </label>
  )
}
