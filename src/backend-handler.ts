import type { SpindleAPI } from 'lumiverse-spindle-types'
import { filename, isId, validateDrawing, type DrawingSummary, type SavedDrawing } from './model'
import { applyColorMutations, emptyPalette, validatePalette, type ColorPalette } from './palette'
import { CATALOG_PAGE_SIZE, readIndex, type CatalogPage, type DrawingIndex, type ThumbnailPreview } from './catalog'
export interface Request { type: 'drawingpad-request'; requestId: string; action: string; data?: unknown }
export interface Reply { type: 'drawingpad-reply'; requestId: string; ok: boolean; result?: unknown; error?: string }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
/** All filesystem and image work uses the documented, scoped Spindle APIs. */
export function createBackendHandler(api: SpindleAPI) {
  const queues = new Map<string, Promise<unknown>>()
  async function operation(action: string, payload: unknown, userId: string | undefined) {
    const data = isObject(payload) ? payload : {}
    const path = () => { if (!isId(data.id)) throw new Error('Invalid drawing identifier.'); return `drawings/${data.id}.json` }
    const index = async () => readIndex(await api.userStorage.getJson<DrawingIndex | DrawingSummary[]>('drawings/index.json', { userId, fallback: [] }))
    const writeIndex = async (entries: DrawingSummary[]) => api.userStorage.setJson('drawings/index.json', { version: 2, revision: crypto.randomUUID(), entries } satisfies DrawingIndex, { userId })
    switch (action) {
      case 'load-colors': return validatePalette(await api.userStorage.getJson<ColorPalette>('colors/palette.json', { userId, fallback: emptyPalette() }))
      case 'update-colors': {
        const palette = await api.userStorage.getJson<ColorPalette>('colors/palette.json', { userId, fallback: emptyPalette() })
        const updated = applyColorMutations(palette, data.mutations)
        await api.userStorage.setJson('colors/palette.json', updated, { userId })
        return updated
      }
      case 'list': {
        const offset = data.offset ?? 0, limit = data.limit ?? CATALOG_PAGE_SIZE
        if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > CATALOG_PAGE_SIZE) throw new Error('Invalid sketchbook page range.')
        const catalog = await index()
        const reset = typeof data.revision === 'string' && data.revision !== catalog.revision
        const start = reset ? 0 : offset
        const entries = catalog.entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
        return { entries: entries.slice(start, start + limit), offset: start, total: entries.length, revision: catalog.revision, reset } satisfies CatalogPage
      }
      case 'thumbnail': {
        path() // Validate the same account-scoped identifier as a document load.
        const preview = await api.userStorage.getJson<ThumbnailPreview | null>(`thumbnails/${data.id}.json`, { userId, fallback: null })
        if (preview) return preview
        const saved = await api.userStorage.getJson<SavedDrawing>(path(), { userId })
        if (!saved.thumbnail) throw new Error('Preview unavailable. Open the page to refresh it.')
        return { thumbnail: saved.thumbnail, previewVersion: String(saved.drawing.updatedAt) } satisfies ThumbnailPreview
      }
      case 'load': return api.userStorage.getJson<SavedDrawing>(path(), { userId })
      case 'save': {
        const drawing = validateDrawing(data.drawing)
        if (typeof data.thumbnail !== 'string' || !data.thumbnail.startsWith('data:image/png;base64,') || data.thumbnail.length > 100_000) throw new Error('Invalid sketch preview.')
        const { entries } = await index()
        const summary: DrawingSummary = { id: drawing.id, title: drawing.title, width: drawing.width, height: drawing.height, updatedAt: drawing.updatedAt, previewVersion: crypto.randomUUID() }
        await api.userStorage.setJson(`drawings/${drawing.id}.json`, { drawing }, { userId })
        await api.userStorage.setJson(`thumbnails/${drawing.id}.json`, { thumbnail: data.thumbnail, previewVersion: summary.previewVersion }, { userId })
        await writeIndex([summary, ...entries.filter(entry => entry.id !== drawing.id)])
        return summary
      }
      case 'delete': {
        await api.userStorage.delete(path(), userId)
        await api.userStorage.delete(`thumbnails/${data.id}.json`, userId)
        await writeIndex((await index()).entries.filter(entry => entry.id !== data.id))
        return true
      }
      case 'upload-image': {
        if (!api.permissions.has('images') || !api.permissions.has('chat_mutation')) throw new Error('Enable Images and Chat mutation for DrawingPad in Extensions to share drawings.')
        if (typeof data.uploadId !== 'string' || !isId(data.uploadId)) throw new Error('Invalid upload identifier.')
        const upload = await api.uploads.get(data.uploadId, userId)
        if (!upload) throw new Error('The image upload expired. Please try sharing again.')
        try {
          if (upload.data.byteLength > 16_000_000 || upload.data[0] !== 137 || upload.data[1] !== 80 || upload.data[2] !== 78 || upload.data[3] !== 71) throw new Error('Share a PNG smaller than 16 MB.')
          return await api.images.upload({ data: upload.data, filename: filename(typeof data.title === 'string' ? data.title : 'DrawingPad'), mime_type: 'image/png' }, userId)
        } finally { await api.uploads.delete(data.uploadId, userId) }
      }
      case 'discard-image': {
        if (typeof data.imageId !== 'string') throw new Error('Invalid image identifier.')
        const image = await api.images.get(data.imageId, { onlyOwned: true, userId })
        return image ? api.images.delete(image.id, userId) : false
      }
      default: throw new Error('Unknown DrawingPad action.')
    }
  }
  return async (payload: unknown, userId?: string, frontendSessionId?: string) => {
    if (!isObject(payload) || payload.type !== 'drawingpad-request' || typeof payload.requestId !== 'string' || payload.requestId.length > 100 || typeof payload.action !== 'string') return
    const { requestId, action, data } = payload
    const key = userId ?? 'extension-owner'
    const previous = queues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      let reply: Reply
      try { reply = { type: 'drawingpad-reply', requestId, ok: true, result: await operation(action, data, userId) } }
      catch (error) { reply = { type: 'drawingpad-reply', requestId, ok: false, error: error instanceof Error ? error.message : String(error) } }
      api.sendToFrontend(reply, userId, frontendSessionId ? { frontendSessionId } : undefined)
    })
    queues.set(key, next)
    await next
    if (queues.get(key) === next) queues.delete(key)
  }
}
