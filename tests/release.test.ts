import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packageRelease, releaseMetadata, type ReleaseManifest } from '../scripts/package-release'

const manifest: ReleaseManifest = { version: '0.1.2', identifier: 'lumink', entry_backend: 'dist/backend.js', entry_frontend: 'dist/frontend.js' }
test('releases derive their tag and prerelease status from the manifest version', () => {
  expect(releaseMetadata(manifest)).toEqual({ version: '0.1.2', tag: 'v0.1.2', prerelease: false })
  expect(releaseMetadata(manifest, 'v0.1.2').tag).toBe('v0.1.2')
  expect(releaseMetadata({ ...manifest, version: '1.0.0-rc.1+build.42' }).prerelease).toBe(true)
  expect(releaseMetadata({ ...manifest, version: '1.0.0+build-release' }).prerelease).toBe(false)
  expect(() => releaseMetadata(manifest, 'v0.1.3')).toThrow('Release tag must be v0.1.2')
  for (const version of ['01.2.3', '1.2', '1.2.3-rc..1', '1.2.3-01', '1.2.3\ntag=another']) expect(() => releaseMetadata({ ...manifest, version })).toThrow('semantic version')
  expect(() => releaseMetadata({ ...manifest, entry_frontend: '../private.js' })).toThrow('entrypoints')
})
test('version checks emit GitHub outputs without a supplied tag or a matching package version', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'lumink-version-test-'))
  try {
    await writeFile(join(fixture, 'spindle.json'), JSON.stringify({ ...manifest, version: '0.2.0-rc.1' }))
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ version: '0.1.0' }))
    const output = join(fixture, 'outputs')
    const check = Bun.spawn([process.execPath, new URL('../scripts/package-release.ts', import.meta.url).pathname, '--check'], {
      cwd: fixture, env: { ...process.env, GITHUB_OUTPUT: output }, stdout: 'pipe', stderr: 'pipe',
    })
    expect(await check.exited).toBe(0)
    expect(await readFile(output, 'utf8')).toBe('version=0.2.0-rc.1\ntag=v0.2.0-rc.1\nprerelease=true\n')
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
test('the archive has an installable manifest and bundles and excludes development/private files', async () => {
  const project = await mkdtemp(join(tmpdir(), 'lumink-release-test-'))
  try {
    await mkdir(join(project, 'dist'))
    await writeFile(join(project, 'spindle.json'), JSON.stringify(manifest))
    await writeFile(join(project, 'package.json'), JSON.stringify({ version: '0.1.0' }))
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
test('automatic releases skip unchanged versions and published releases and validate existing tags', async () => {
  const workflow = Bun.YAML.parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as {
    on: { push: { branches: string[]; paths: string[]; tags?: string[] }; workflow_dispatch: unknown }
    jobs: { release: { if: string; steps: { name: string; run?: string }[] } }
  }
  expect(workflow.on.push).toEqual({ branches: ['main'], paths: ['spindle.json'] })
  expect(workflow.on).toHaveProperty('workflow_dispatch')
  expect(workflow.jobs.release.if).toBe("github.ref == 'refs/heads/main'")
  const script = workflow.jobs.release.steps.find(step => step.name === 'Decide whether to release')!.run!
  const fixture = await mkdtemp(join(tmpdir(), 'lumink-auto-release-test-'))
  const cases = [
    { name: 'version bump', publish: true },
    { name: 'metadata edit', previous: '0.1.2', publish: false },
    { name: 'manual current version', event: 'workflow_dispatch', previous: '0.1.2', publish: true },
    { name: 'already published', state: 'published', publish: false },
    { name: 'draft retry', state: 'draft', tag: 'matching', publish: true },
    { name: 'existing tag', tag: 'matching', publish: true },
    { name: 'conflicting tag', tag: 'conflicting', failure: true },
    { name: 'initial branch push', before: '0'.repeat(40), publish: true },
    { name: 'new manifest', previousManifest: false, publish: true },
    { name: 'force push', beforeAvailable: false, publish: true },
  ]
  try {
    for (const scenario of cases) {
      const log = join(fixture, `${scenario.name}.log`)
      const output = join(fixture, `${scenario.name}.outputs`)
      await writeFile(log, '')
      await writeFile(output, '')
      const stub = `git() {
        printf 'git %s\\n' "$*" >> "$TEST_RELEASE_LOG"
        case "$1 $2" in
          'cat-file -e')
            if [[ "$3" == *':spindle.json' ]]; then
              [[ "$TEST_PREVIOUS_MANIFEST" == 'true' ]]
            else
              [[ "$TEST_BEFORE_AVAILABLE" == 'true' ]]
            fi ;;
          'fetch --no-tags') TEST_BEFORE_AVAILABLE=true ;;
          'show '*) printf '{"version":"%s"}\\n' "$TEST_PREVIOUS_VERSION" ;;
          'rev-parse --verify')
            case "$TEST_TAG_STATE" in
              missing) return 1 ;;
              matching) printf '%s\\n' "$GITHUB_SHA" ;;
              conflicting) printf 'different-commit\\n' ;;
            esac ;;
          *) return 2 ;;
        esac
      }
      gh() {
        printf 'gh %s\\n' "$*" >> "$TEST_RELEASE_LOG"
        case "$TEST_RELEASE_STATE" in
          missing) return 1 ;;
          draft) printf 'true\\n' ;;
          published) printf 'false\\n' ;;
        esac
      }`
      const decide = Bun.spawn(['bash', '-c', `${stub}\n${script}`], { stdout: 'pipe', stderr: 'pipe', env: {
        ...process.env, GH_TOKEN: 'stub', GH_REPO: 'example/lumink', GITHUB_SHA: 'b'.repeat(40), GITHUB_OUTPUT: output,
        RELEASE_TAG: 'v0.1.2', RELEASE_VERSION: '0.1.2', EVENT_NAME: scenario.event ?? 'push', BEFORE_SHA: scenario.before ?? 'a'.repeat(40),
        TEST_RELEASE_LOG: log, TEST_RELEASE_STATE: scenario.state ?? 'missing', TEST_TAG_STATE: scenario.tag ?? 'missing',
        TEST_PREVIOUS_VERSION: scenario.previous ?? '0.1.1', TEST_PREVIOUS_MANIFEST: String(scenario.previousManifest ?? true), TEST_BEFORE_AVAILABLE: String(scenario.beforeAvailable ?? true),
      } })
      const [exitCode, stdout, stderr] = await Promise.all([decide.exited, new Response(decide.stdout).text(), new Response(decide.stderr).text()])
      expect({ scenario: scenario.name, exitCode }).toEqual({ scenario: scenario.name, exitCode: scenario.failure ? 1 : 0 })
      expect(await readFile(output, 'utf8')).toBe(scenario.failure ? '' : `publish=${scenario.publish}\n`)
      const calls = await readFile(log, 'utf8')
      if (scenario.event === 'workflow_dispatch' || scenario.before === '0'.repeat(40)) expect(calls).not.toContain('git show')
      if (scenario.name === 'metadata edit') expect(calls).not.toContain('gh release view')
      if (scenario.name === 'force push') expect(calls).toContain(`git fetch --no-tags origin ${'a'.repeat(40)}`)
      if (scenario.failure) expect(stderr).toContain('points to another commit')
      else if (!scenario.publish) expect(stdout).toContain('skipping release')
      expect(calls).not.toContain('gh release create')
    }
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
test('publication creates tags on the build commit, uploads before publishing, and recovers drafts', async () => {
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
      const publish = Bun.spawn(['bash', '-c', `${stub}\n${script}`], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GH_TOKEN: 'stub', GH_REPO: 'example/lumink', GITHUB_SHA: 'b'.repeat(40), RELEASE_TAG: prerelease ? 'v1.0.0-rc.1' : 'v1.0.0', RELEASE_PRERELEASE: String(prerelease), TEST_RELEASE_LOG: log, TEST_RELEASE_STATE: state } })
      const [exitCode] = await Promise.all([publish.exited, new Response(publish.stdout).text(), new Response(publish.stderr).text()])
      const calls = (await readFile(log, 'utf8')).trim().split('\n')
      if (state === 'published') {
        expect(exitCode).toBe(1); expect(calls).toHaveLength(1)
      } else {
        expect(exitCode).toBe(0)
        if (state === 'missing') {
          expect(calls[1]).toContain(`--draft --target ${'b'.repeat(40)}`)
          expect(calls[1]).not.toContain('--verify-tag')
          expect(calls[1]!.includes('--prerelease')).toBe(prerelease)
        } else expect(calls.some(call => call.startsWith('release create '))).toBe(false)
        expect(calls.at(-2)).toContain('release/lumink.zip release/lumink.zip.sha256 --clobber')
        expect(calls.at(-1)).toContain(`--draft=false --prerelease=${prerelease} --target ${'b'.repeat(40)}`)
      }
    }
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
