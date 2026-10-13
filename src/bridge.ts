import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import type { Reply } from './backend-handler'
export class BackendBridge {
  private pending = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private unsubscribe: () => void
  private destroyed = false
  constructor(private ctx: SpindleFrontendContext) {
    this.unsubscribe = ctx.onBackendMessage(payload => {
      const reply = payload as Reply
      if (!reply || reply.type !== 'drawingpad-reply') return
      const pending = this.pending.get(reply.requestId)
      if (!pending) return
      clearTimeout(pending.timer); this.pending.delete(reply.requestId)
      if (reply.ok) pending.resolve(reply.result)
      else pending.reject(new Error(reply.error || 'DrawingPad could not complete this action.'))
    })
  }
  call<T>(action: string, data?: unknown): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error('DrawingPad has closed.'))
    const requestId = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('DrawingPad’s backend did not respond. Your drawing is still on this page; export it or try again.')) }, 60_000)
      this.pending.set(requestId, { resolve: result => resolve(result as T), reject, timer })
      try { this.ctx.sendToBackend({ type: 'drawingpad-request', requestId, action, data }) }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error) }
    })
  }
  destroy() {
    this.destroyed = true; this.unsubscribe()
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('DrawingPad has closed.')) }
    this.pending.clear()
  }
}
