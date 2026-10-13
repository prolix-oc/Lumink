import { Upload } from 'tus-js-client'
import type { ImageDTO, SpindleFrontendContext } from 'lumiverse-spindle-types'
import type { BackendBridge } from './bridge'
import { filename } from './model'

export function nativeAttachment(image: ImageDTO) {
  return { type: 'image', image_id: image.id, mime_type: image.mime_type, original_filename: image.original_filename, ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}) }
}
export class ShareHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export async function postDrawingToChat(chatId: string, image: ImageDTO, caption: string, signal: AbortSignal) {
  // Spindle's appendMessage API only accepts text/metadata. The existing core
  // message route is needed for native extra.attachments (display + vision).
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ is_user: true, name: 'User', content: caption.trim(), extra: { attachments: [nativeAttachment(image)], spindle_metadata: { source: 'drawingpad' } } }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ShareHttpError(body?.error || `Could not share the drawing (${response.status}).`, response.status)
  }
  return response.json() as Promise<{ id: string }>
}
export async function uploadPng(blob: Blob, title: string, extension: string, signal: AbortSignal, progress: (percent: number) => void) {
  if (blob.size > 16_000_000) throw new Error('This PNG exceeds the 16 MB sharing limit. Save it to your device instead.')
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, id?: string) => { if (settled) return; settled = true; signal.removeEventListener('abort', cancel); error ? reject(error) : resolve(id!) }
    const upload = new Upload(blob, {
      endpoint: '/api/v1/spindle-uploads', chunkSize: 1024 * 1024, retryDelays: [0, 1000, 3000],
      storeFingerprintForResuming: false,
      metadata: { extension, filename: filename(title) },
      onProgress: (sent, total) => progress(Math.round(sent / total * 100)),
      onError: error => finish(error),
      onSuccess: () => {
        const id = upload.url?.split('/').filter(Boolean).pop()
        id ? finish(undefined, id) : finish(new Error('The upload did not return an identifier.'))
      },
    })
    const cancel = () => { void upload.abort().catch(() => undefined); finish(new Error('Sharing was cancelled.')) }
    if (signal.aborted) { cancel(); return }
    signal.addEventListener('abort', cancel, { once: true }); upload.start()
  })
}
export async function shareDrawing(ctx: SpindleFrontendContext, bridge: BackendBridge, blob: Blob, title: string, caption: string, signal: AbortSignal, progress: (message: string) => void) {
  const { chatId } = ctx.getActiveChat()
  if (!chatId) throw new Error('Open a chat before sharing your drawing.')
  const granted = await ctx.permissions.getGranted()
  if (!['images', 'chat_mutation'].every(permission => granted.includes(permission))) throw new Error('Enable Images and Chat mutation for DrawingPad in Extensions to share drawings.')
  progress('Uploading drawing…')
  const uploadId = await uploadPng(blob, title, ctx.manifest.identifier, signal, percent => progress(`Uploading drawing · ${percent}%`))
  const image = await bridge.call<ImageDTO>('upload-image', { uploadId, title })
  if (signal.aborted || ctx.getActiveChat().chatId !== chatId) {
    await bridge.call('discard-image', { imageId: image.id }).catch(() => undefined)
    throw new Error('The active chat changed. Share again to send to the current chat.')
  }
  // Recheck a permission revoked while the upload was in flight.
  const latest = await ctx.permissions.getGranted()
  if (!latest.includes('chat_mutation')) {
    await bridge.call('discard-image', { imageId: image.id }).catch(() => undefined)
    throw new Error('Chat mutation permission was revoked. Your drawing was not sent.')
  }
  progress('Sharing to chat…')
  if (signal.aborted || ctx.getActiveChat().chatId !== chatId) {
    await bridge.call('discard-image', { imageId: image.id }).catch(() => undefined)
    throw new Error('The active chat changed. Share again to send to the current chat.')
  }
  // Do not automatically retry this non-idempotent POST. An interrupted response
  // can mean the server already accepted it. Keep the image in that case.
  try { return await postDrawingToChat(chatId, image, caption, signal) }
  catch (error) {
    if (error instanceof ShareHttpError && error.status >= 400 && error.status < 500) {
      // Client/authorization rejections happened before creation. A 5xx,
      // network failure or abort can follow acceptance, so retain that image.
      await bridge.call('discard-image', { imageId: image.id }).catch(() => undefined)
    }
    throw new Error(`${error instanceof Error ? error.message : String(error)} Check the chat before trying again.`)
  }
}
/** Call directly from a click: iOS Web Share requires transient user activation. */
export async function saveToDevice(blob: Blob, title: string, root: HTMLElement) {
  const file = new File([blob], filename(title), { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; /* Fall back to a download. */ }
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = file.name; root.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
