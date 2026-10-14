import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packageRelease, releaseMetadata, type ReleaseManifest } from '../scripts/package-release'

const manifest: ReleaseManifest = { version: '0.1.2', identifier: 'lumink', entry_backend: 'dist/backend.js', entry_frontend: 'dist/frontend.js' }
test('releases require matching tag and manifest/package versions and detect prereleases', () => {
  expect(releaseMetadata(manifest, '0.1.2', 'v0.1.2')).toEqual({ version: '0.1.2', tag: 'v0.1.2', prerelease: false })
  expect(releaseMetadata({ ...manifest, version: '1.0.0-rc.1+build.42' }, '1.0.0-rc.1+build.42').prerelease).toBe(true)
  expect(releaseMetadata({ ...manifest, version: '1.0.0+build-release' }, '1.0.0+build-release').prerelease).toBe(false)
  expect(() => releaseMetadata(manifest, '0.1.1', 'v0.1.2')).toThrow('Version mismatch')
  expect(() => releaseMetadata(manifest, '0.1.2', 'v0.1.3')).toThrow('Release tag must be v0.1.2')
  for (const version of ['01.2.3', '1.2', '1.2.3-rc..1', '1.2.3-01', '1.2.3\ntag=another']) expect(() => releaseMetadata({ ...manifest, version }, version)).toThrow('semantic version')
  expect(() => releaseMetadata({ ...manifest, entry_frontend: '../private.js' }, '0.1.2')).toThrow('entrypoints')
})
test('the archive has an installable manifest and bundles and excludes development/private files', async () => {
  const project = await mkdtemp(join(tmpdir(), 'lumink-release-test-'))
  try {
    await mkdir(join(project, 'dist'))
    await writeFile(join(project, 'spindle.json'), JSON.stringify(manifest))
    await writeFile(join(project, 'package.json'), JSON.stringify({ version: manifest.version }))
    const files = ['dist/backend.js', 'dist/frontend.js', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']
    for (const file of files) await writeFile(join(project, file), `Contents of ${file}`)
    for (const file of ['.env', '.illarin-proof', 'dist/stale.js']) await writeFile(join(project, file), 'Must not be packaged')
    const release = await packageRelease(project)
    const listing = Bun.spawn(['unzip', '-Z1', release.archive], { stdout: 'pipe' })
    expect(await listing.exited).toBe(0)
    expect((await new Response(listing.stdout).text()).trim().split('\n').sort()).toEqual(['spindle.json', ...files].sort())
    const entry = Bun.spawn(['unzip', '-p', release.archive, 'spindle.json'], { stdout: 'pipe' })
    expect(JSON.parse(await new Response(entry.stdout).text())).toEqual(manifest)
    expect(await entry.exited).toBe(0)
    const checksum = createHash('sha256').update(await readFile(release.archive)).digest('hex')
    expect(await readFile(release.checksum, 'utf8')).toBe(`${checksum}  lumink.zip\n`)
    // Repackaging must replace an old ZIP rather than retaining deleted entries.
    const contaminate = Bun.spawn(['zip', '-q', release.archive, 'dist/stale.js'], { cwd: project })
    expect(await contaminate.exited).toBe(0)
    await packageRelease(project)
    const repacked = Bun.spawn(['unzip', '-Z1', release.archive], { stdout: 'pipe' })
    expect((await new Response(repacked.stdout).text()).trim().split('\n').sort()).toEqual(['spindle.json', ...files].sort())
    expect(await repacked.exited).toBe(0)
    expect(await readFile(release.checksum, 'utf8')).toBe(`${createHash('sha256').update(await readFile(release.archive)).digest('hex')}  lumink.zip\n`)
  } finally { await rm(project, { recursive: true, force: true }) }
})
test('publication uploads assets before publishing, recovers drafts, and refuses published releases', async () => {
  const workflow = Bun.YAML.parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as { jobs: { release: { steps: { name: string; run?: string }[] } } }
  const script = workflow.jobs.release.steps.find(step => step.name === 'Publish GitHub release for Illarin')!.run!
  const fixture = await mkdtemp(join(tmpdir(), 'lumink-publish-test-'))
  try {
    for (const state of ['missing', 'draft', 'published']) for (const prerelease of [false, true]) {
      const log = join(fixture, `${state}-${prerelease}.log`)
      const stub = `gh() {
        printf '%s\\n' "$*" >> "$TEST_RELEASE_LOG"
        if [[ "$1 $2" == 'release view' ]]; then
          case "$TEST_RELEASE_STATE" in
            missing) return 1 ;;
            draft) printf 'true\\n' ;;
            published) printf 'false\\n' ;;
          esac
        fi
      }`
      const publish = Bun.spawn(['bash', '-c', `${stub}\n${script}`], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GH_TOKEN: 'stub', GH_REPO: 'example/lumink', RELEASE_TAG: prerelease ? 'v1.0.0-rc.1' : 'v1.0.0', RELEASE_PRERELEASE: String(prerelease), TEST_RELEASE_LOG: log, TEST_RELEASE_STATE: state } })
      const [exitCode] = await Promise.all([publish.exited, new Response(publish.stdout).text(), new Response(publish.stderr).text()])
      const calls = (await readFile(log, 'utf8')).trim().split('\n')
      if (state === 'published') {
        expect(exitCode).toBe(1); expect(calls).toHaveLength(1)
      } else {
        expect(exitCode).toBe(0)
        if (state === 'missing') {
          expect(calls[1]).toContain('--draft --verify-tag')
          expect(calls[1]!.includes('--prerelease')).toBe(prerelease)
        } else expect(calls.some(call => call.startsWith('release create '))).toBe(false)
        expect(calls.at(-2)).toContain('release/lumink.zip release/lumink.zip.sha256 --clobber')
        expect(calls.at(-1)).toContain(`--draft=false --prerelease=${prerelease} --verify-tag`)
      }
    }
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
