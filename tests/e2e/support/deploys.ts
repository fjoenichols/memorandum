import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'

/** Builds the app into `outDir`, stamped with `buildId`, as a deploy would. */
export function buildVersion(buildId: string, outDir: string) {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    env: { ...process.env, VITE_BUILD_ID: buildId },
    stdio: 'inherit',
  })
}

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

/**
 * A static server whose content can be swapped, like a host receiving a new
 * deploy. Unknown paths fall back to index.html, as on the real host.
 */
export async function startDeployServer(initialDir: string) {
  let dir = initialDir
  const server = createServer(async (req, res) => {
    const path = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '')
    let file = join(dir, path === '/' ? 'index.html' : path)
    let body: Buffer
    try {
      body = await readFile(file)
    } catch {
      file = join(dir, 'index.html')
      body = await readFile(file)
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}/`,
    deploy(newDir: string) {
      dir = newDir
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
