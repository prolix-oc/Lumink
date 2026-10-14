import { clamp } from './model'

/** Floating companions use layout pixels, including inside the host's UI zoom. */
export class FloatingPanel {
  private abort = new AbortController()
  private observer: ResizeObserver
  private position: { x: number; y: number } | null = null
  private drag: { id: number; x: number; y: number; left: number; top: number } | null = null
  constructor(private container: HTMLElement, private panel: HTMLElement, private heading: HTMLElement, private initial: () => { x: number; y: number }) {
    const signal = this.abort.signal
    panel.addEventListener('pointerdown', () => this.bringToFront(), { signal })
    panel.addEventListener('focusin', () => this.bringToFront(), { signal })
    heading.addEventListener('pointerdown', event => {
      if ((event.target as Element).closest('button') || (event.pointerType === 'mouse' && event.button !== 0) || this.drag) return
      event.preventDefault(); this.layout(); heading.focus({ preventScroll: true })
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop }
      try { heading.setPointerCapture(event.pointerId) } catch { /* Synthetic input. */ }
    }, { signal })
    heading.addEventListener('pointermove', event => {
      if (this.drag?.id !== event.pointerId) return
      const bounds = container.getBoundingClientRect(), drag = this.drag
      panel.dataset.floating = 'true'
      this.position = { x: drag.left + (event.clientX - drag.x) * container.clientWidth / bounds.width, y: drag.top + (event.clientY - drag.y) * container.clientHeight / bounds.height }
      this.layout()
    }, { signal })
    const release = (event: PointerEvent) => { if (this.drag?.id === event.pointerId) this.drag = null }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) heading.addEventListener(event, release as EventListener, { signal })
    heading.addEventListener('keydown', event => {
      if (event.target !== heading || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); const step = event.shiftKey ? 40 : 10
      this.position = { x: panel.offsetLeft + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: panel.offsetTop + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }
      this.layout()
    }, { signal })
    this.observer = new ResizeObserver(() => this.layout())
    this.observer.observe(container); this.observer.observe(panel)
  }
  bringToFront() {
    for (const panel of this.container.querySelectorAll<HTMLElement>('.dp-floating-panel')) panel.style.zIndex = panel === this.panel ? '9' : '8'
  }
  layout() {
    if (this.panel.hidden) return
    const inset = 8
    const safeTop = parseFloat(getComputedStyle(this.container).paddingTop) || 0
    const close = this.container.querySelector<HTMLElement>('.dp-close')
    const topInset = Math.max(safeTop + inset, close ? close.offsetTop + close.offsetHeight + inset : 0)
    const tools = this.container.querySelector<HTMLElement>('.dp-tools'), bounds = this.container.getBoundingClientRect()
    const leftInset = tools ? Math.max(inset, (tools.getBoundingClientRect().right - bounds.left) * this.container.clientWidth / bounds.width + inset) : inset
    this.panel.style.maxWidth = `${Math.max(40, this.container.clientWidth - leftInset - inset)}px`
    this.panel.style.maxHeight = `${Math.max(40, this.container.clientHeight - topInset - inset)}px`
    const position = this.position ?? this.initial()
    const x = clamp(position.x, leftInset, Math.max(leftInset, this.container.clientWidth - this.panel.offsetWidth - inset))
    const y = clamp(position.y, topInset, Math.max(topInset, this.container.clientHeight - this.panel.offsetHeight - inset))
    this.panel.style.left = `${x}px`; this.panel.style.top = `${y}px`
    if (this.position) this.position = { x, y }
  }
  destroy() { this.abort.abort(); this.observer.disconnect() }
}
