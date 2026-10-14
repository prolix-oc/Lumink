import { describe, expect, test } from 'bun:test'
import type { SpindleAPI } from 'lumiverse-spindle-types'
import { createBackendHandler, type Reply } from '../src/backend-handler'
import { createDrawing, type SavedDrawing } from '../src/model'
import type { CatalogPage, DrawingIndex, ThumbnailPreview } from '../src/catalog'
function fixture() {
  const files = new Map<string, unknown>(), replies: { user?: string; session?: string; reply: Reply }[] = [], reads: string[] = []
  let uploads = 0, deletes = 0
  const grants = new Set(['images', 'chat_mutation'])
  const api = {
    userStorage: {
      getJson: async (path: string, options: { userId: string; fallback?: unknown }) => { const key = `${options.userId}/${path}`; reads.push(key); if (files.has(key)) return structuredClone(files.get(key)); if ('fallback' in options) return options.fallback; throw new Error('Missing drawing') },
      setJson: async (path: string, value: unknown, options: { userId: string }) => { await Promise.resolve(); files.set(`${options.userId}/${path}`, structuredClone(value)) },
      delete: async (path: string, user: string) => { files.delete(`${user}/${path}`) },
    },
    permissions: { has: (permission: string) => grants.has(permission) },
    uploads: { get: async (_id: string, user: string) => user === 'owner' ? { data: new Uint8Array([137, 80, 78, 71]), size: 4 } : null, delete: async () => { deletes++; return true } },
    images: { upload: async () => { uploads++; return { id: 'image' } } },
    sendToFrontend: (reply: Reply, user?: string, options?: { frontendSessionId: string }) => replies.push({ user, session: options?.frontendSessionId, reply }),
  } as unknown as SpindleAPI
  const handler = createBackendHandler(api)
  const call = async (action: string, data: unknown, user = 'owner', session = 'document-a') => { const requestId = crypto.randomUUID(); await handler({ type: 'drawingpad-request', requestId, action, data }, user, session); return replies.find(item => item.reply.requestId === requestId)!.reply }
  return { files, reads, replies, grants, handler, call, get uploads() { return uploads }, get deletes() { return deletes } }
}
describe('scoped sketchbook backend', () => {
  test('large pages still save and reopen after exceeding the former document limits', async () => {
    const f = fixture(), drawing = createDrawing()
    drawing.layers[0]!.strokes = [{ id: crypto.randomUUID(), tool: 'ink', color: '#23202b', size: 8, opacity: 1, smoothing: 0, pressure: true, points: Array.from({ length: 125_000 }, () => [100.25, 200.75, 0.555, 0.123]) }]
    drawing.layers[0]!.selectionMoves = [{ strokeIndex: 1, polygon: [[90, 190], [110, 190], [110, 210], [90, 210]], offset: [20, 30] }]
    expect((await f.call('save', { drawing, thumbnail: 'data:image/png;base64,large' })).ok).toBe(true)
    const saved = (await f.call('load', { id: drawing.id })).result as SavedDrawing
    expect(saved.drawing.layers[0]!.strokes[0]!.points).toHaveLength(125_000)
    expect(saved.drawing.layers[0]!.selectionMoves).toEqual(drawing.layers[0]!.selectionMoves)
  })
  test('account color palettes are isolated and concurrent mutations merge', async () => {
    const f = fixture()
    await Promise.all([
      f.call('update-colors', { mutations: [{ type: 'save', color: '#abc' }] }),
      f.call('update-colors', { mutations: [{ type: 'save', color: '#fedcba' }, { type: 'use', color: '#abc' }] }),
    ])
    expect((await f.call('load-colors', {})).result).toEqual({ version: 1, recent: ['#aabbcc'], saved: ['#aabbcc', '#fedcba'] })
    expect((await f.call('load-colors', {}, 'other')).result).toEqual({ version: 1, recent: [], saved: [] })
    expect((await f.call('update-colors', { mutations: [{ type: 'save', color: 'invalid' }] })).ok).toBe(false)
    expect((await f.call('load-colors', {})).result).toEqual({ version: 1, recent: ['#aabbcc'], saved: ['#aabbcc', '#fedcba'] })
    await f.call('update-colors', { mutations: [{ type: 'remove', color: '#abc' }] })
    expect((await f.call('load-colors', {})).result).toEqual({ version: 1, recent: ['#aabbcc'], saved: ['#fedcba'] })
  })
  test('saves are isolated by user and replies return to the originating document', async () => {
    const f = fixture(), drawing = createDrawing()
    expect((await f.call('save', { drawing, thumbnail: 'data:image/png;base64,abc' })).ok).toBe(true)
    expect(((await f.call('list', {}, 'other')).result as CatalogPage).entries).toEqual([])
    expect((await f.call('load', { id: drawing.id }, 'other')).ok).toBe(false)
    expect((await f.call('thumbnail', { id: drawing.id }, 'other')).ok).toBe(false)
    expect(f.replies[0]!.session).toBe('document-a')
    expect(f.replies[0]!.user).toBe('owner')
  })
  test('concurrent saves preserve both index entries', async () => {
    const f = fixture()
    await Promise.all([f.call('save', { drawing: createDrawing(), thumbnail: 'data:image/png;base64,a' }), f.call('save', { drawing: createDrawing(), thumbnail: 'data:image/png;base64,b' })])
    expect(((await f.call('list', {})).result as CatalogPage).total).toBe(2)
  })
  test('a thousand legacy pages remain accessible; saving migrates only the index and has no page cap', async () => {
    const f = fixture(), thumbnail = 'data:image/png;base64,old'
    const drawings = Array.from({ length: 1000 }, (_, i) => ({ ...createDrawing(), updatedAt: 1000 - i, title: `Page ${i}` }))
    const legacy = drawings.map(drawing => ({ id: drawing.id, title: drawing.title, width: drawing.width, height: drawing.height, updatedAt: drawing.updatedAt, thumbnail }))
    f.files.set('owner/drawings/index.json', legacy)
    for (const drawing of drawings) f.files.set(`owner/drawings/${drawing.id}.json`, { drawing, thumbnail })
    const first = (await f.call('list', {})).result as CatalogPage
    expect(first.total).toBe(1000); expect(first.entries).toHaveLength(64)
    expect(JSON.stringify(first)).not.toContain('data:image')
    expect((await f.call('thumbnail', { id: drawings[999]!.id })).result).toEqual({ thumbnail, previewVersion: '1' })
    const saved = await f.call('save', { drawing: { ...createDrawing(), updatedAt: 2000 }, thumbnail: 'data:image/png;base64,new' })
    expect(saved.ok).toBe(true)
    const index = f.files.get('owner/drawings/index.json') as DrawingIndex
    expect(index.version).toBe(2); expect(index.entries).toHaveLength(1001)
    expect(JSON.stringify(index)).not.toContain('data:image')
    expect((await f.call('load', { id: drawings[999]!.id })).result).toEqual({ drawing: drawings[999], thumbnail })
    const ids: string[] = []
    for (let offset = 0; offset < 1001; offset += 64) {
      const page = (await f.call('list', { offset, revision: index.revision })).result as CatalogPage
      expect(page.reset).toBe(false); expect(page.entries.length).toBeLessThanOrEqual(64)
      ids.push(...page.entries.map(entry => entry.id))
    }
    expect(new Set(ids).size).toBe(1001)
    expect(ids.slice(1)).toEqual(drawings.map(drawing => drawing.id))
    await f.call('delete', { id: drawings[999]!.id })
    expect(((await f.call('list', {})).result as CatalogPage).total).toBe(1000)
  })
  test('preview reads avoid full documents, revisions invalidate caches even with identical timestamps, and deletion cleans previews', async () => {
    const f = fixture(), drawing = createDrawing()
    const first = await f.call('save', { drawing, thumbnail: 'data:image/png;base64,first' })
    f.reads.length = 0
    const preview = (await f.call('thumbnail', { id: drawing.id })).result as ThumbnailPreview
    expect(preview.thumbnail).toBe('data:image/png;base64,first')
    expect(f.reads).toEqual([`owner/thumbnails/${drawing.id}.json`])
    const oldPage = (await f.call('list', {})).result as CatalogPage
    const second = await f.call('save', { drawing, thumbnail: 'data:image/png;base64,second' })
    expect((first.result as any).previewVersion).not.toBe((second.result as any).previewVersion)
    const changed = (await f.call('list', { offset: 64, revision: oldPage.revision })).result as CatalogPage
    expect(changed.reset).toBe(true); expect(changed.offset).toBe(0); expect(changed.total).toBe(1)
    await f.call('delete', { id: drawing.id })
    expect(f.files.has(`owner/thumbnails/${drawing.id}.json`)).toBe(false)
    expect((await f.call('thumbnail', { id: drawing.id })).ok).toBe(false)
  })
  test('page ranges are bounded and timestamp ties have a stable ordering', async () => {
    const f = fixture(), drawings = Array.from({ length: 70 }, () => ({ ...createDrawing(), updatedAt: 100 }))
    await Promise.all(drawings.map(drawing => f.call('save', { drawing, thumbnail: 'data:image/png;base64,a' })))
    const first = (await f.call('list', { limit: 64 })).result as CatalogPage
    const last = (await f.call('list', { offset: 64, revision: first.revision })).result as CatalogPage
    expect([...first.entries, ...last.entries].map(entry => entry.id)).toEqual(drawings.map(drawing => drawing.id).sort())
    expect((await f.call('list', { limit: 65 })).ok).toBe(false)
    expect((await f.call('list', { offset: -1 })).ok).toBe(false)
    expect((await f.call('list', { offset: 0.5 })).ok).toBe(false)
    expect((await f.call('thumbnail', { id: '../index' })).ok).toBe(false)
  })
  test('rejects traversal and checks revoked permissions before image upload', async () => {
    const f = fixture()
    expect((await f.call('delete', { id: '../../config' })).ok).toBe(false)
    f.grants.delete('chat_mutation')
    expect((await f.call('upload-image', { uploadId: crypto.randomUUID() })).ok).toBe(false)
    expect(f.uploads).toBe(0)
  })
  test('cannot consume another user’s staged PNG; successful uploads are cleaned up', async () => {
    const f = fixture(), uploadId = crypto.randomUUID()
    expect((await f.call('upload-image', { uploadId }, 'other')).ok).toBe(false)
    expect(f.uploads).toBe(0)
    expect((await f.call('upload-image', { uploadId })).ok).toBe(true)
    expect(f.uploads).toBe(1); expect(f.deletes).toBe(1)
  })
})
