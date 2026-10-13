import type { BackendBridge } from './bridge'
import { applyColorMutations, emptyPalette, validatePalette, type ColorMutation, type ColorPalette } from './palette'
import { SAVE_DEBOUNCE_MS } from './saver'

/** Store mutations so another tab's saved colors are preserved by the backend merge. */
export class PaletteStore {
  private value = emptyPalette()
  private pending: ColorMutation[] = []
  private running: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private listeners = new Set<(palette: ColorPalette, error: string | null) => void>()
  private error: string | null = null
  private ready: Promise<void>
  constructor(private bridge: BackendBridge) {
    this.ready = bridge.call<ColorPalette>('load-colors').then(palette => {
      this.value = applyColorMutations(validatePalette(palette), this.pending); this.emit()
    }).catch(error => { this.fail(error) })
  }
  subscribe(listener: (palette: ColorPalette, error: string | null) => void) {
    this.listeners.add(listener); listener(this.value, this.error)
    return () => { this.listeners.delete(listener) }
  }
  use(color: string) { this.change({ type: 'use', color }) }
  save(color: string) { this.change({ type: 'save', color }) }
  remove(color: string) { this.change({ type: 'remove', color }) }
  private change(mutation: ColorMutation) {
    try {
      const next = applyColorMutations(this.value, [mutation])
      if (JSON.stringify(next) === JSON.stringify(this.value)) return
      this.value = next; this.pending.push(mutation); this.error = null; this.emit()
      clearTimeout(this.timer)
      this.timer = setTimeout(() => { void this.flush().catch(() => undefined) }, SAVE_DEBOUNCE_MS)
    } catch (error) { this.fail(error) }
  }
  private emit() { for (const listener of this.listeners) listener(this.value, this.error) }
  private fail(error: unknown) { this.error = `Colors could not be saved. ${error instanceof Error ? error.message : String(error)}`; this.emit() }
  flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined
    if (this.running) return this.running
    this.running = this.drain().finally(() => { this.running = null })
    return this.running
  }
  private async drain() {
    await this.ready
    while (this.pending.length) {
      const mutations = this.pending.splice(0, 256)
      try {
        const palette = await this.bridge.call<ColorPalette>('update-colors', { mutations })
        this.value = applyColorMutations(validatePalette(palette), this.pending); this.error = null; this.emit()
      } catch (error) { this.pending.unshift(...mutations); this.fail(error); throw error }
    }
  }
  async destroy() { clearTimeout(this.timer); try { await this.flush() } finally { this.listeners.clear() } }
}
