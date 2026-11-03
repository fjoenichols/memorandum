/**
 * Folder path helpers. A folder path is its names joined with "/", such as
 * "Recipes/Desserts". The top level of a space is the empty path "".
 */

/** Trims each name and drops empty ones: " Recipes//Desserts/ " → "Recipes/Desserts". */
export function normalizeFolder(path: string): string {
  return path
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)
    .join('/')
}

/** The path and every folder above it: "a/b/c" → ["a", "a/b", "a/b/c"]. */
export function withAncestors(path: string): string[] {
  const names = path.split('/').filter(Boolean)
  return names.map((_, i) => names.slice(0, i + 1).join('/'))
}

export function parentFolder(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

export function folderName(path: string): string {
  return path.split('/').at(-1) ?? ''
}

export function joinFolder(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

/** True if `path` is `folder` itself or anywhere inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}

/** Rewrites `path` from under `from` to the same place under `to`. */
export function relocate(path: string, from: string, to: string): string {
  return to + path.slice(from.length)
}

/** A single folder name or title: not empty, and no "/" since it becomes a file or folder name. */
export function validName(name: string, what: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${what} can't be empty`)
  if (trimmed.includes('/')) throw new Error(`${what} can't contain "/"`)
  return trimmed
}
