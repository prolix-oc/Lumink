import type { BackendBridge } from './bridge'
import type { Drawing, DrawingSummary } from './model'
export const SAVE_DEBOUNCE_MS = 700
/** Coalesce pending saves per page and serialize writes, including page switches. */
export class DraftSaver {
  private pending = new Map<string, { drawing: Drawing; thumbnail: string }>()
  private running: Promise<void> | null = null
  private active: Drawing | null = null
  constructor(private bridge: BackendBridge, private saved: (drawing: Drawing, summary: DrawingSummary) => void, private error: (error: Error) => void) {}
  enqueue(drawing: Drawing, thumbnail: string) {
    if (this.active === drawing) return this.flush()
    this.pending.set(drawing.id, { drawing, thumbnail })
    return this.flush()
  }
  flush(): Promise<void> {
    if (this.running) return this.running
    this.running = this.drain().finally(() => { this.running = null })
    return this.running
  }
  private async drain() {
    while (this.pending.size) {
      const [id, value] = this.pending.entries().next().value!
      this.pending.delete(id)
      this.active = value.drawing
      try { const summary = await this.bridge.call<DrawingSummary>('save', value); this.saved(value.drawing, summary) }
      catch (error) { if (!this.pending.has(id)) this.pending.set(id, value); this.error(error instanceof Error ? error : new Error(String(error))); throw error }
      finally { this.active = null }
    }
  }
}
