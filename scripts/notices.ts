import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
const visited = new Set<string>(), notices: string[] = []
async function include(name: string) {
  if (visited.has(name)) return
  visited.add(name)
  const root = join('node_modules', name), pkg = await Bun.file(join(root, 'package.json')).json()
  const files = (await readdir(root)).filter(file => /^(license|licence|copying)(\.|$)/i.test(file))
  for (const file of files) notices.push(`${name} ${pkg.version}\n${'='.repeat(60)}\n${await Bun.file(join(root, file)).text()}`)
  for (const dependency of Object.keys(pkg.dependencies || {})) await include(dependency)
}
await include('perfect-freehand'); await include('tus-js-client')
await Bun.write('THIRD_PARTY_NOTICES.txt', `Runtime dependency license notices\n\n${notices.join('\n\n')}`)
