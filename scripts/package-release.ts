import { createHash } from 'node:crypto'
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// Illarin's named-attachment setting requires this exact name on every release.
export const RELEASE_ASSET = 'lumink.zip'
export interface ReleaseManifest { version: string; identifier: string; entry_backend: string; entry_frontend: string }
export function releaseMetadata(manifest: ReleaseManifest, tag = `v${manifest.version}`) {
  const version = manifest.version
  const match = typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version)
  if (!match || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) throw new Error('spindle.json must have a valid semantic version.')
  if (tag !== `v${version}`) throw new Error(`Release tag must be v${version}; received ${tag}.`)
  if (manifest.identifier !== 'lumink' || manifest.entry_backend !== 'dist/backend.js' || manifest.entry_frontend !== 'dist/frontend.js') throw new Error('The release must contain Lumink and its built dist/backend.js and dist/frontend.js entrypoints.')
  return { version, tag, prerelease: !!match[4] }
}
async function metadata(project: string, tag?: string) {
  const manifest = JSON.parse(await readFile(join(project, 'spindle.json'), 'utf8')) as ReleaseManifest
  return releaseMetadata(manifest, tag)
}
export async function packageRelease(project: string, output = join(project, 'release')) {
  const release = await metadata(project)
  const files = ['spindle.json', 'dist/backend.js', 'dist/frontend.js', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']
  await mkdir(output, { recursive: true })
  const stage = await mkdtemp(join(output, '.stage-'))
  try {
    for (const file of files) {
      const bytes = await readFile(join(project, file))
      if (!bytes.length) throw new Error(`Cannot package an empty ${file}. Run bun run build first.`)
      await mkdir(dirname(join(stage, file)), { recursive: true })
      await copyFile(join(project, file), join(stage, file))
    }
    const archive = Bun.spawn(['zip', '-q', '-X', '-9', RELEASE_ASSET, ...files], { cwd: stage, stdout: 'pipe', stderr: 'pipe' })
    const [exitCode, error] = await Promise.all([archive.exited, new Response(archive.stderr).text()])
    if (exitCode !== 0) throw new Error(`Could not create ${RELEASE_ASSET}: ${error.trim()}`)
    const checksum = createHash('sha256').update(await readFile(join(stage, RELEASE_ASSET))).digest('hex')
    await writeFile(join(stage, `${RELEASE_ASSET}.sha256`), `${checksum}  ${RELEASE_ASSET}\n`)
    for (const file of [RELEASE_ASSET, `${RELEASE_ASSET}.sha256`]) await rename(join(stage, file), join(output, file))
    return { ...release, archive: join(output, RELEASE_ASSET), checksum: join(output, `${RELEASE_ASSET}.sha256`) }
  } finally { await rm(stage, { recursive: true, force: true }) }
}
if (import.meta.main) {
  const [mode, tag, extra] = Bun.argv.slice(2)
  if (extra || (mode !== undefined && mode !== '--check')) throw new Error('Usage: bun run scripts/package-release.ts [--check [vX.Y.Z]]')
  if (mode === '--check') {
    const release = await metadata(process.cwd(), tag)
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${release.version}\ntag=${release.tag}\nprerelease=${release.prerelease}\n`)
    console.log(`Validated ${release.tag}${release.prerelease ? ' (prerelease)' : ''}`)
  } else {
    const release = await packageRelease(resolve(process.cwd()))
    console.log(`Packaged ${release.tag}: ${release.archive}\nSHA-256: ${release.checksum}`)
  }
}
