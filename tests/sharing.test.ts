import { afterEach, expect, test } from 'bun:test'
import type { ImageDTO } from 'lumiverse-spindle-types'
import { nativeAttachment, postDrawingToChat, ShareHttpError } from '../src/sharing'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const image = { id: 'stored-png', mime_type: 'image/png', original_filename: 'sketch.png', width: 1200, height: 900 } as ImageDTO
test('shares a native image attachment with authenticated user-message semantics', async () => {
  let calls = 0
  globalThis.fetch = (async (url: unknown, options: RequestInit) => {
    calls++
    expect(url).toBe('/api/v1/chats/chat%2Fsafe/messages')
    expect(options.credentials).toBe('same-origin')
    const body = JSON.parse(options.body as string)
    expect(body.is_user).toBe(true)
    expect(body.content).toBe('A note')
    expect(body.extra.attachments).toEqual([nativeAttachment(image)])
    expect(body.extra.spindle_metadata.source).toBe('drawingpad')
    return Response.json({ id: 'message' }, { status: 201 })
  }) as typeof fetch
  expect((await postDrawingToChat('chat/safe', image, ' A note ', new AbortController().signal)).id).toBe('message')
  expect(calls).toBe(1)
})
test('a rejected message is not silently retried', async () => {
  let calls = 0
  globalThis.fetch = Object.assign(async () => { calls++; return Response.json({ error: 'Chat unavailable' }, { status: 403 }) }, { preconnect: originalFetch.preconnect }) as typeof fetch
  await expect(postDrawingToChat('chat', image, '', new AbortController().signal)).rejects.toBeInstanceOf(ShareHttpError)
  expect(calls).toBe(1)
})
