import type { SpindleFrontendContext, SpindleModalHandle } from 'lumiverse-spindle-types'
import { DrawingPadApp } from './app'
import { SketchbookGallery } from './gallery'
import { BackendBridge } from './bridge'
import { icon } from './icons'
import { createDrawing, type Drawing, type SavedDrawing } from './model'
import { chooseCanvasSize } from './new-page'
import { styles } from './styles'
import { PaletteStore } from './palette-store'

export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(styles)
  const bridge = new BackendBridge(ctx)
  const palette = new PaletteStore(bridge)
  const tab = ctx.ui.registerDrawerTab({ id: 'sketchbook', title: 'DrawingPad', shortName: 'Draw', headerTitle: 'DrawingPad', description: 'Sketch, jot notes, and share a drawing to chat', keywords: ['draw', 'pencil', 'sketch', 'notes', 'paint'], iconSvg: icon('pencil') })
  tab.root.innerHTML = `<section class="dp-launcher"><header class="dp-launcher-heading"><h2>Sketchbook</h2><p>A space for sketches and handwritten notes.</p></header><div class="dp-launcher-actions"><button type="button" class="dp-primary" data-launch="continue">${icon('pencil')}Open DrawingPad</button><button type="button" data-launch="new">${icon('plus')}New page</button></div><div class="dp-recent-heading"><h3>Recent pages</h3><button type="button" data-launch="refresh" aria-label="Refresh recent pages" title="Refresh recent pages">${icon('refresh')}</button></div><div class="dp-gallery"></div><p class="dp-launcher-status" role="status">Loading your sketchbook…</p></section>`
  const action = ctx.ui.registerInputBarAction({ id: 'open-drawingpad', label: 'Draw or jot a note', iconSvg: icon('pencil') })
  let app: DrawingPadApp | null = null, modal: SpindleModalHandle | null = null, destroyed = false, opening = false
  let unsavedRecovery: Drawing | null = null
  const notice = (message: string) => { if (!destroyed) { const status = tab.root.querySelector<HTMLElement>('.dp-launcher-status')!; status.textContent = message; status.hidden = !message } }
  const gallery = new SketchbookGallery(tab.root.querySelector('.dp-gallery')!, bridge, {
    open: (id, opener) => open(id, false, opener),
    remove: async id => { await bridge.call('delete', { id }) },
    error: error => notice(error.message),
  })
  async function refresh() {
    if (destroyed) return
    await gallery.refresh()
    notice('')
  }
  async function open(id?: string, fresh = false, trigger?: HTMLElement) {
    if (destroyed || opening) return
    if (app) { tab.activate(); return }
    opening = true
    const opener = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    let drawing: Drawing = createDrawing()
    try {
      const target = fresh ? undefined : id ?? await gallery.latest()
      if (unsavedRecovery) drawing = unsavedRecovery
      else if (target) drawing = (await bridge.call<SavedDrawing>('load', { id: target })).drawing
      else {
        const size = await chooseCanvasSize(ctx)
        if (!size) { if (opener?.isConnected) opener.focus({ preventScroll: true }); return }
        drawing = createDrawing(size.width, size.height)
      }
      if (destroyed) return
      gallery.setActive(false)
      modal = ctx.ui.showModal({ title: 'DrawingPad', width: 1280, maxHeight: Math.max(400, window.innerHeight - 32), persistent: true })
      modal.root.classList.add('dp-workspace-root')
      modal.root.setAttribute('role', 'dialog'); modal.root.setAttribute('aria-modal', 'true'); modal.root.setAttribute('aria-label', 'DrawingPad')
      app = new DrawingPadApp(modal.root, ctx, bridge, palette, drawing, () => { void refresh() }, () => modal?.dismiss())
      if (unsavedRecovery) app.markUnsaved()
      modal.onDismiss(() => {
        const closing = app; app = null; modal = null
        gallery.setActive(true)
        const restore = () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); else tab.root.querySelector<HTMLElement>('.dp-gallery-scroll')?.focus({ preventScroll: true }) }
        restore()
        if (closing) {
          const snapshot = closing.history.current
          unsavedRecovery = snapshot
          void closing.destroy().then(async () => { if (unsavedRecovery === snapshot) unsavedRecovery = null; await refresh(); restore() }).catch(error => {
            unsavedRecovery = snapshot
            notice(`${error.message} Reopen DrawingPad to recover this page, then save it to your device.`)
          })
        }
      })
    } catch (error) { notice(error instanceof Error ? error.message : String(error)) }
    finally { opening = false }
  }
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-launch]')
    if (!button) return
    if (button.dataset.launch === 'refresh') void refresh()
    else void open(undefined, button.dataset.launch === 'new', button)
  }
  tab.root.addEventListener('click', click)
  const unsubAction = action.onClick(() => { void open() })
  const unsubActivate = tab.onActivate(() => { void refresh() })
  const unsubChat = ctx.events.on('CHAT_SWITCHED', () => app?.onChatChanged())
  void refresh()
  return async () => {
    destroyed = true; unsubAction(); unsubActivate(); unsubChat(); tab.root.removeEventListener('click', click)
    const closing = app; app = null; modal?.dismiss(); modal = null
    try { await closing?.destroy() } catch { /* The account/session may already be closed. */ }
    try { await palette.destroy() } catch { /* Keep failed color changes in memory until the session closes. */ }
    gallery.destroy(); bridge.destroy(); action.destroy(); tab.destroy(); removeStyle()
  }
}
