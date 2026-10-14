import type { Drawing, PagePoint, SelectionMove } from './model'

export function polygonBounds(polygon: PagePoint[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const [x, y] of polygon) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y) }
  return { left, top, right, bottom }
}
export function insidePolygon([x, y]: PagePoint, polygon: PagePoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i]!, [bx, by] = polygon[j]!
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}
export function translatePolygon(polygon: PagePoint[], [dx, dy]: PagePoint): PagePoint[] { return polygon.map(([x, y]) => [x + dx, y + dy]) }

/** The selection is transient; only completed moves enter the document history. */
export class LassoSelection {
  private polygon: PagePoint[] = []
  private tracing: PagePoint[] | null = null
  private drag: { start: PagePoint; offset: PagePoint } | null = null
  private frame = 0
  constructor(private overlay: SVGSVGElement, private toolbar: HTMLElement, private drawing: () => Drawing,
    private hasContent: (polygon: PagePoint[]) => boolean, private preview: (move?: SelectionMove) => void,
    private commit: (move: SelectionMove) => void, private notice: (message: string) => void) {}
  get hasSelection() { return this.polygon.length > 0 }
  start(point: PagePoint) {
    if (this.hasSelection && insidePolygon(point, this.polygon)) this.drag = { start: point, offset: [0, 0] }
    else { this.polygon = []; this.tracing = [point] }
    this.render()
  }
  move(point: PagePoint) {
    if (this.tracing) {
      const previous = this.tracing.at(-1)!
      if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.5) this.tracing.push(point)
    } else if (this.drag) {
      this.drag.offset = [point[0] - this.drag.start[0], point[1] - this.drag.start[1]]
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.drag) this.preview(this.operation(this.drag.offset))
      this.render()
    })
  }
  end(point: PagePoint) {
    this.move(point); this.stopFrame()
    if (this.tracing) {
      const polygon = this.tracing; this.tracing = null
      if (polygon.length >= 3 && this.hasContent(polygon)) { this.polygon = polygon; this.notice('Drag inside the selection to move it. Tap Done to finish.') }
      else { this.polygon = []; this.notice('Draw a loop around artwork on the active layer.') }
    } else if (this.drag) {
      const offset = this.drag.offset; this.drag = null; this.preview()
      if (Math.hypot(...offset) > 0.01) {
        const move = this.operation(offset)
        this.polygon = translatePolygon(this.polygon, offset)
        this.commit(move)
      }
    }
    this.render()
  }
  cancel() { this.stopFrame(); this.tracing = null; this.drag = null; this.preview(); this.render() }
  clear() { this.polygon = []; this.cancel() }
  private stopFrame() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0 }
  private operation(offset: PagePoint): SelectionMove {
    const drawing = this.drawing(), layer = drawing.layers.find(layer => layer.id === drawing.activeLayerId)!
    return { strokeIndex: layer.strokes.length, polygon: this.polygon, offset }
  }
  private render() {
    const polygon = this.tracing ?? (this.drag ? translatePolygon(this.polygon, this.drag.offset) : this.polygon)
    this.overlay.setAttribute('viewBox', `0 0 ${this.drawing().width} ${this.drawing().height}`)
    const path = `M${polygon.map(point => point.join(',')).join(' L')}${polygon.length > 2 ? ' Z' : ''}`
    for (const el of this.overlay.querySelectorAll('path')) el.setAttribute('d', polygon.length ? path : '')
    this.overlay.toggleAttribute('hidden', !polygon.length); this.toolbar.hidden = !this.hasSelection || !!this.tracing
  }
}
