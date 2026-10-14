import { clamp, type Drawing, type PagePoint, type Point, type Stroke, type Tool } from './model'
import { PenSmoother } from './smoothing'
import { TwoFingerTap } from './touch-undo'
export interface BrushSettings { tool: Tool; color: string; size: number; opacity: number; smoothing: number; pressure: boolean; penOnly: boolean; predictions: boolean }
export interface PencilReading { pointer: string; pressure: number; tiltX: number; tiltY: number; samples: number; coalesced: boolean; predicted: boolean }
export interface Camera { x: number; y: number; scale: number; rotation: number }
const rotate = (x: number, y: number, angle: number): [number, number] => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]
export function screenToPage(x: number, y: number, camera: Camera): [number, number] { return rotate((x - camera.x) / camera.scale, (y - camera.y) / camera.scale, -camera.rotation) }
export function pageToScreen(x: number, y: number, camera: Camera): [number, number] {
  const [rx, ry] = rotate(x * camera.scale, y * camera.scale, camera.rotation)
  return [camera.x + rx, camera.y + ry]
}
export function cameraAtPoint(scale: number, rotation: number, pageX: number, pageY: number, x: number, y: number): Camera {
  const [rx, ry] = rotate(pageX * scale, pageY * scale, rotation)
  return { x: x - rx, y: y - ry, scale, rotation }
}
export const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
/** Flat within 3°, with smoothly fading attraction out to 9° from each quarter turn. */
export function softSnapRotation(angle: number): number {
  const target = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2), delta = angle - target
  const inner = Math.PI / 60, outer = Math.PI / 20, distance = Math.abs(delta)
  if (distance <= inner) return target
  if (distance >= outer) return angle
  const t = (distance - inner) / (outer - inner)
  return target + delta * t * t * (3 - 2 * t)
}
export function zoomAround(camera: Camera, scale: number, x: number, y: number): Camera {
  const [pageX, pageY] = screenToPage(x, y, camera)
  const bounded = clamp(scale, 0.000001, 8)
  return cameraAtPoint(bounded, camera.rotation, pageX, pageY, x, y)
}
export function realSamples(event: PointerEvent): PointerEvent[] {
  try {
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    return events.length ? events : [event]
  } catch { return [event] }
}
export class DrawingInput {
  camera: Camera = { x: 0, y: 0, scale: 1, rotation: 0 }
  private abort = new AbortController()
  private observer: ResizeObserver
  private active: { pointerId: number; layerId: string; stroke: Stroke; predicted: Point[]; smoother: PenSmoother | null } | null = null
  private pointers = new Map<number, { x: number; y: number; type: string }>()
  private gesture: { ids: [number, number]; distance: number; scale: number; pageX: number; pageY: number; angle: number; rotation: number } | null = null
  // Preserve finger intent separately from the magnetized display angle, so pan/zoom
  // or restarting a gesture cannot apply the attraction repeatedly and creep the view.
  private rotationIntent = 0
  private pan: { pointerId: number; x: number; y: number } | null = null
  private selecting: number | null = null
  private touchTap = new TwoFingerTap()
  private tapView: { camera: Camera; fitted: boolean; rotationIntent: number } | null = null
  private frame = 0
  private fitted = true
  private readingAt = 0
  constructor(
    private viewport: HTMLElement,
    private sheet: HTMLElement,
    private cursor: HTMLElement,
    private drawing: () => Drawing,
    private settings: () => BrushSettings,
    private preview: (value?: { layerId: string; stroke: Stroke; predicted?: Point[] }) => void,
    private commit: (stroke: Stroke, layerId: string) => void,
    private reading: (reading: PencilReading) => void,
    private cameraChange: (camera: Camera) => void,
    private warning: (message: string) => void,
    private actions: { undo(): void; selection: { start(point: PagePoint): void; move(point: PagePoint): void; end(point: PagePoint): void; cancel(): void } },
  ) {
    const signal = this.abort.signal
    viewport.addEventListener('pointerdown', this.down, { signal })
    viewport.addEventListener('pointermove', this.move, { signal })
    viewport.addEventListener('pointerup', this.up, { signal })
    viewport.addEventListener('pointercancel', this.cancelPointer, { signal })
    viewport.addEventListener('lostpointercapture', this.cancelPointer, { signal })
    viewport.addEventListener('pointerleave', () => { cursor.hidden = true }, { signal })
    viewport.addEventListener('contextmenu', event => event.preventDefault(), { signal })
    viewport.addEventListener('wheel', this.wheel, { signal, passive: false })
    this.observer = new ResizeObserver(() => { if (this.fitted) this.fit(); else this.updateCamera() })
    this.observer.observe(viewport)
    this.fit()
  }
  get isDrawing() { return !!this.active || this.selecting !== null }
  fit() {
    const d = this.drawing(), width = this.viewport.clientWidth, height = this.viewport.clientHeight
    if (!width || !height) return
    const scale = Math.max(0.000001, Math.min((width - 40) / d.width, (height - 40) / d.height))
    this.camera = { scale, x: (width - d.width * scale) / 2, y: (height - d.height * scale) / 2, rotation: 0 }
    this.rotationIntent = 0; this.gesture = null; this.pan = null
    this.fitted = true; this.updateCamera()
  }
  zoom(factor: number) {
    this.camera = zoomAround(this.camera, this.camera.scale * factor, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2)
    this.fitted = false; this.updateCamera()
  }
  resetRotation() {
    this.cancelStroke(); this.gesture = null; this.pan = null; this.pointers.clear(); this.touchTap.reset(); this.tapView = null
    const x = this.viewport.clientWidth / 2, y = this.viewport.clientHeight / 2
    const [pageX, pageY] = screenToPage(x, y, this.camera)
    this.camera = cameraAtPoint(this.camera.scale, 0, pageX, pageY, x, y)
    this.rotationIntent = 0; this.fitted = false; this.updateCamera()
  }
  private updateCamera() {
    this.sheet.style.width = `${this.drawing().width}px`; this.sheet.style.height = `${this.drawing().height}px`
    this.sheet.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) rotate(${this.camera.rotation}rad) scale(${this.camera.scale})`
    this.cursor.hidden = true
    this.cameraChange(this.camera)
  }
  private location(event: PointerEvent | WheelEvent) {
    const rect = this.viewport.getBoundingClientRect()
    // Host UI zoom scales rendered pixels; the camera and CSS offsets use layout pixels.
    return { x: (event.clientX - rect.left) * this.viewport.clientWidth / (rect.width || 1), y: (event.clientY - rect.top) * this.viewport.clientHeight / (rect.height || 1) }
  }
  private point(event: PointerEvent): Point {
    const { x, y } = this.location(event), [px, py] = screenToPage(x, y, this.camera)
    const pressure = event.pointerType === 'pen' ? clamp(event.pressure, 0, 1) : 0.5
    const tilt = event.pointerType === 'pen' ? clamp(Math.hypot(event.tiltX, event.tiltY) / 90, 0, 1) : 0
    const d = this.drawing()
    return [Math.round(clamp(px, -4096, Math.max(6144, d.width + 4096)) * 100) / 100, Math.round(clamp(py, -4096, Math.max(6144, d.height + 4096)) * 100) / 100, Math.round(pressure * 1000) / 1000, Math.round(tilt * 1000) / 1000]
  }
  private capture(id: number) { try { this.viewport.setPointerCapture(id) } catch { /* Synthetic test input does not have native pointer capture. */ } }
  private beginGesture() {
    if (this.gesture) return // A third finger must not replace the active pair.
    const points = [...this.pointers.entries()].filter(([, point]) => point.type === 'touch').slice(0, 2)
    if (points.length !== 2) return
    this.cancelStroke()
    const [first, second] = points as [typeof points[number], typeof points[number]], a = first[1], b = second[1]
    const [pageX, pageY] = screenToPage((a.x + b.x) / 2, (a.y + b.y) / 2, this.camera)
    this.gesture = { ids: [first[0], second[0]], distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), scale: this.camera.scale, pageX, pageY, angle: Math.atan2(b.y - a.y, b.x - a.x), rotation: this.rotationIntent }
    this.pan = null; this.fitted = false
  }
  private down = (event: PointerEvent) => {
    if ((event.target as Element | null)?.closest('button')) return
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    // A resting palm must never move the sheet underneath an active Pencil stroke.
    if (this.isDrawing && event.pointerId !== (this.active?.pointerId ?? this.selecting) && event.pointerType !== 'touch') return
    if (event.pointerType === 'touch' && this.pointers.get(this.active?.pointerId ?? this.selecting ?? -1)?.type === 'pen') return
    const location = this.location(event)
    if (event.pointerType === 'pen') {
      this.cancelStroke(); this.pointers.clear(); this.pan = null; this.gesture = null; this.touchTap.reset(); this.tapView = null
    }
    if (event.pointerType === 'touch') {
      if (![...this.pointers.values()].some(point => point.type === 'touch')) this.tapView = { camera: { ...this.camera }, fitted: this.fitted, rotationIntent: this.rotationIntent }
      this.touchTap.down(event.pointerId, event.clientX, event.clientY, event.timeStamp)
    }
    this.pointers.set(event.pointerId, { ...location, type: event.pointerType })
    this.capture(event.pointerId)
    if (event.pointerType === 'touch' && [...this.pointers.values()].filter(point => point.type === 'touch').length >= 2) { this.beginGesture(); return }
    const settings = this.settings(), d = this.drawing()
    const [x, y] = screenToPage(location.x, location.y, this.camera)
    if (settings.tool === 'hand' || (settings.penOnly && event.pointerType === 'touch') || event.button === 1 || x < 0 || y < 0 || x > d.width || y > d.height) {
      this.pan = { pointerId: event.pointerId, ...location }; this.fitted = false; return
    }
    const layer = d.layers.find(layer => layer.id === d.activeLayerId)
    if (!layer?.visible || layer.opacity === 0) { this.warning('Show the active layer before drawing.'); return }
    if (settings.tool === 'lasso') { this.selecting = event.pointerId; this.actions.selection.start([x, y]); return }
    if (this.active) return
    const rect = this.viewport.getBoundingClientRect()
    const smoother = event.pointerType === 'pen' ? new PenSmoother(settings.smoothing, this.camera.scale * rect.width / (this.viewport.clientWidth || 1)) : null
    const first = this.point(event)
    this.active = { pointerId: event.pointerId, layerId: layer.id, predicted: [], smoother, stroke: { id: crypto.randomUUID(), tool: settings.tool, color: settings.color, size: settings.size, opacity: settings.opacity, smoothing: settings.smoothing, pressure: settings.pressure && event.pointerType === 'pen', ...(smoother ? { penSmoothing: 1 as const } : {}), points: [smoother?.push(first, event.timeStamp) ?? first] } }
    this.schedulePreview(); this.updateReading(event, 1)
  }
  private move = (event: PointerEvent) => {
    const location = this.location(event)
    if (event.pointerType === 'touch') this.touchTap.move(event.pointerId, event.clientX, event.clientY)
    const pointer = this.pointers.get(event.pointerId)
    if (pointer) this.pointers.set(event.pointerId, { ...location, type: pointer.type })
    if (this.gesture) {
      const g = this.gesture, a = this.pointers.get(g.ids[0]), b = this.pointers.get(g.ids[1])
      if (a && b && g.ids.includes(event.pointerId)) {
        event.preventDefault()
        const distance = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x)
        if (distance >= 4) { g.rotation += angleDelta(angle - g.angle); g.angle = angle }
        this.rotationIntent = g.rotation
        const scale = clamp(g.scale * distance / g.distance, 0.000001, 8)
        this.camera = cameraAtPoint(scale, softSnapRotation(g.rotation), g.pageX, g.pageY, (a.x + b.x) / 2, (a.y + b.y) / 2); this.updateCamera()
      }
      return
    }
    if (this.pan?.pointerId === event.pointerId) {
      this.camera.x += location.x - this.pan.x; this.camera.y += location.y - this.pan.y
      this.pan = { pointerId: event.pointerId, ...location }; this.updateCamera(); return
    }
    if (this.selecting === event.pointerId) {
      event.preventDefault()
      for (const sample of realSamples(event)) { const point = this.point(sample); this.actions.selection.move([point[0], point[1]]) }
      return
    }
    if (this.active?.pointerId === event.pointerId) {
      event.preventDefault()
      const samples = realSamples(event)
      for (const sample of samples) this.appendSample(sample)
      const predictedFilter = this.active.smoother?.clone()
      this.active.predicted = []
      if (this.active.stroke.tool !== 'blend' && this.settings().predictions && event.pointerType === 'pen' && typeof event.getPredictedEvents === 'function') {
        try { this.active.predicted = event.getPredictedEvents().slice(0, 8).map(sample => predictedFilter?.push(this.point(sample), sample.timeStamp) ?? this.point(sample)) } catch { /* Prediction is optional. */ }
      }
      this.schedulePreview(); this.updateReading(event, samples.length)
    } else if (event.pointerType === 'pen' || event.pointerType === 'mouse') this.updateReading(event, 0)
    const size = Math.max(4, this.settings().size * this.camera.scale)
    this.cursor.hidden = ['hand', 'lasso'].includes(this.settings().tool) || event.pointerType === 'touch'
    this.cursor.style.width = `${size}px`; this.cursor.style.height = `${size}px`
    this.cursor.style.transform = `translate(${location.x - size / 2}px, ${location.y - size / 2}px)`
  }
  private updateReading(event: PointerEvent, samples: number) {
    if (performance.now() - this.readingAt < 80) return
    this.readingAt = performance.now()
    this.reading({ pointer: event.pointerType, pressure: event.pressure, tiltX: event.tiltX, tiltY: event.tiltY, samples, coalesced: typeof event.getCoalescedEvents === 'function', predicted: typeof event.getPredictedEvents === 'function' })
  }
  private schedulePreview() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.preview(this.active ?? undefined) })
  }
  private appendPoint(point: Point) {
    if (!this.active) return
    // Filter state retains precision; stored samples keep the existing compact format.
    point = [Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100, Math.round(point[2] * 1000) / 1000, Math.round((point[3] ?? 0) * 1000) / 1000]
    const previous = this.active.stroke.points.at(-1)!
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.05 || Math.abs(point[2] - previous[2]) > 0.01 || Math.abs((point[3] ?? 0) - (previous[3] ?? 0)) > 0.01) this.active.stroke.points.push(point)
  }
  private appendSample(event: PointerEvent) {
    if (!this.active) return
    const point = this.point(event)
    this.appendPoint(this.active.smoother?.push(point, event.timeStamp) ?? point)
  }
  private up = (event: PointerEvent) => {
    if (this.selecting === event.pointerId) { const point = this.point(event); this.selecting = null; this.actions.selection.end([point[0], point[1]]) }
    if (this.active?.pointerId === event.pointerId) {
      // Consume the final contact samples, but not a zero-pressure pointerup tail.
      for (const sample of realSamples(event)) if (sample.pressure > 0) this.appendSample(sample)
      const endpoint = this.active.smoother?.finish()
      if (endpoint) this.appendPoint(endpoint)
      const { stroke, layerId } = this.active
      this.active = null; this.preview(); this.commit(stroke, layerId)
    }
    const undo = event.pointerType === 'touch' && this.touchTap.up(event.pointerId, event.clientX, event.clientY, event.timeStamp)
    this.endPointer(event.pointerId)
    if (undo) {
      if (this.tapView) { this.camera = this.tapView.camera; this.fitted = this.tapView.fitted; this.rotationIntent = this.tapView.rotationIntent; this.updateCamera() }
      this.actions.undo()
    }
    if (![...this.pointers.values()].some(point => point.type === 'touch')) this.tapView = null
  }
  private endPointer(id: number) {
    this.pointers.delete(id)
    if (this.pan?.pointerId === id) this.pan = null
    if (this.gesture?.ids.includes(id)) {
      this.gesture = null
      const remaining = [...this.pointers.entries()].filter(([, p]) => p.type === 'touch')
      if (remaining.length >= 2) this.beginGesture()
      else if (remaining[0]) this.pan = { pointerId: remaining[0][0], x: remaining[0][1].x, y: remaining[0][1].y }
    }
    try { if (this.viewport.hasPointerCapture(id)) this.viewport.releasePointerCapture(id) } catch { /* Already released by the browser. */ }
  }
  private cancelPointer = (event: PointerEvent) => { this.touchTap.cancel(event.pointerId); if (this.active?.pointerId === event.pointerId || this.selecting === event.pointerId) this.cancelStroke(); this.endPointer(event.pointerId) }
  cancelStroke() { this.active = null; if (this.selecting !== null) { this.selecting = null; this.actions.selection.cancel() }; if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.preview() }
  reset() { this.cancelStroke(); this.pointers.clear(); this.pan = null; this.gesture = null; this.touchTap.reset(); this.tapView = null; this.fit() }
  private wheel = (event: WheelEvent) => {
    event.preventDefault()
    const { x, y } = this.location(event)
    this.camera = zoomAround(this.camera, this.camera.scale * Math.exp(-event.deltaY * 0.002), x, y)
    this.fitted = false; this.updateCamera()
  }
  destroy() { this.cancelStroke(); this.abort.abort(); this.observer.disconnect(); this.pointers.clear() }
}
