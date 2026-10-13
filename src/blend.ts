import { clamp, type Point, type Stroke } from './model'
import { releaseCanvas } from './canvas'

/** Distance-based dabs give sparse and coalesced samples the same blend strength. */
export class BrushDabs {
  private previous: Point | null = null
  private lastDab: Point | null = null
  private remaining: number
  constructor(private spacing: number, private dab: (point: Point, first: boolean) => void) { this.remaining = spacing }
  append(points: readonly Point[]) {
    for (const point of points) {
      if (!this.previous) { this.dab(point, true); this.previous = point; this.lastDab = point; continue }
      const previous = this.previous, distance = Math.hypot(point[0] - previous[0], point[1] - previous[1])
      let along = this.remaining
      while (along <= distance) {
        const t = along / distance
        const sample: Point = [previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t,
          previous[2] + (point[2] - previous[2]) * t, (previous[3] ?? 0) + ((point[3] ?? 0) - (previous[3] ?? 0)) * t]
        this.dab(sample, false); this.lastDab = sample; along += this.spacing
      }
      this.remaining = along - distance; this.previous = point
    }
  }
  finish() {
    if (this.previous && this.lastDab && Math.hypot(this.previous[0] - this.lastDab[0], this.previous[1] - this.lastDab[1]) > this.spacing * 0.1) {
      this.dab(this.previous, false); this.lastDab = this.previous
    }
  }
}

function patch(size: number) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('DrawingPad needs Canvas 2D support.')
  return { canvas, context }
}

/** Carry a small, feathered color reservoir along the active layer. Premultiplied
 * interpolation (destination-out + lighter) also blends alpha correctly, including
 * transparent edges. No page-sized readback, blur buffer, or stored raster is needed.
 */
export class BlendBrush {
  private reservoir: ReturnType<typeof patch>
  private pickup: ReturnType<typeof patch>
  private deposit: ReturnType<typeof patch>
  private mask: ReturnType<typeof patch>
  private transform: DOMMatrix
  private diameter: number
  private path: BrushDabs
  constructor(private ctx: CanvasRenderingContext2D, private stroke: Stroke) {
    this.transform = ctx.getTransform()
    this.diameter = Math.max(1, stroke.size * Math.max(Math.abs(this.transform.a), Math.abs(this.transform.d)))
    const size = Math.ceil(this.diameter) + 2
    this.reservoir = patch(size); this.pickup = patch(size); this.deposit = patch(size); this.mask = patch(size)
    const center = size / 2, radius = this.diameter / 2
    const gradient = this.mask.context.createRadialGradient(center, center, 0, center, center, radius)
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.35, '#fff'); gradient.addColorStop(1, '#ffffff00')
    this.mask.context.fillStyle = gradient; this.mask.context.fillRect(0, 0, size, size)
    this.path = new BrushDabs(Math.max(0.5, stroke.size * 0.15), (point, first) => this.dab(point, first))
  }
  append(points: readonly Point[]) { this.path.append(points) }
  finish() { this.path.finish() }
  private dab(point: Point, first: boolean) {
    const size = this.reservoir.canvas.width
    const x = this.transform.a * point[0] + this.transform.e - size / 2
    const y = this.transform.d * point[1] + this.transform.f - size / 2
    // Skip wholly off-page dabs without discarding the carried colors.
    if (x + size <= 0 || y + size <= 0 || x >= this.ctx.canvas.width || y >= this.ctx.canvas.height) return
    const pickup = this.pickup.context, reservoir = this.reservoir.context, deposit = this.deposit.context
    pickup.clearRect(0, 0, size, size)
    pickup.drawImage(this.ctx.canvas, x, y, size, size, 0, 0, size, size)
    if (first) { reservoir.drawImage(this.pickup.canvas, 0, 0); return }
    const strength = this.stroke.opacity * (this.stroke.pressure ? clamp(point[2], 0, 1) : 1) * 0.65
    if (strength === 0) return
    deposit.clearRect(0, 0, size, size); deposit.drawImage(this.reservoir.canvas, 0, 0)
    deposit.globalCompositeOperation = 'destination-in'; deposit.drawImage(this.mask.canvas, 0, 0); deposit.globalCompositeOperation = 'source-over'
    this.ctx.save(); this.ctx.resetTransform(); this.ctx.globalAlpha = strength
    this.ctx.globalCompositeOperation = 'destination-out'; this.ctx.drawImage(this.mask.canvas, x, y)
    this.ctx.globalCompositeOperation = 'lighter'; this.ctx.drawImage(this.deposit.canvas, x, y); this.ctx.restore()
    // Pick up some of the encountered color so a stroke mixes, rather than clones.
    reservoir.globalCompositeOperation = 'destination-out'; reservoir.globalAlpha = 0.22
    reservoir.fillStyle = '#fff'; reservoir.fillRect(0, 0, size, size)
    reservoir.globalCompositeOperation = 'lighter'; reservoir.drawImage(this.pickup.canvas, 0, 0)
    reservoir.globalCompositeOperation = 'source-over'; reservoir.globalAlpha = 1
  }
  destroy() { for (const buffer of [this.reservoir, this.pickup, this.deposit, this.mask]) releaseCanvas(buffer.canvas) }
}
