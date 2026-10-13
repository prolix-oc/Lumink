export const MAX_LAYERS = 6
export const MAX_POINTS = 60_000
export const MAX_DOCUMENT_BYTES = 3_000_000
export const MAX_STROKE_POINTS = 12_000
// Full-resolution PNG composition uses two RGBA buffers. Preview layers stay small.
export const EXPORT_MEMORY_BUDGET = 128 * 1024 * 1024
export const EXPORT_BYTES_PER_PIXEL = 8
export const MAX_CANVAS_PIXELS = EXPORT_MEMORY_BUDGET / EXPORT_BYTES_PER_PIXEL
export type Tool = 'ink' | 'pencil' | 'marker' | 'blend' | 'eraser' | 'hand'
export type Paper = 'plain' | 'cream' | 'ruled' | 'grid' | 'transparent'
export type Point = [number, number, number, number?]
export interface Stroke {
  id: string
  tool: Exclude<Tool, 'hand'>
  color: string
  size: number
  opacity: number
  smoothing: number
  pressure: boolean
  /** Points have already passed through the adaptive pen filter. Older strokes omit it. */
  penSmoothing?: 1
  points: Point[]
}
export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
  strokes: Stroke[]
}
export interface Drawing {
  version: 1
  id: string
  title: string
  width: number
  height: number
  paper: Paper
  activeLayerId: string
  updatedAt: number
  layers: Layer[]
}
export interface DrawingSummary {
  id: string
  title: string
  updatedAt: number
  width: number
  height: number
  previewVersion: string
}
// Older pages contain an inline preview; new pages keep it in a separate file.
export interface SavedDrawing { drawing: Drawing; thumbnail?: string }
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export const countPoints = (drawing: Drawing) => drawing.layers.reduce((sum, layer) => sum + layer.strokes.reduce((n, stroke) => n + stroke.points.length, 0), 0)
export function validCanvasSize(width: unknown, height: unknown): boolean {
  return canvasSizeError(width, height) === null
}
export function canvasSizeError(width: unknown, height: unknown): string | null {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return 'Enter positive whole pixel dimensions.'
  const bytes = width * height * EXPORT_BYTES_PER_PIXEL
  if (bytes > EXPORT_MEMORY_BUDGET) return `PNG working memory would be ${(bytes / 1024 / 1024).toFixed(0)} MiB. The current export budget is 128 MiB; try a smaller canvas.`
  return null
}
export function createDrawing(width = 1200, height = 900): Drawing {
  const error = canvasSizeError(width, height)
  if (error) throw new Error(error)
  const layerId = crypto.randomUUID()
  return { version: 1, id: crypto.randomUUID(), title: 'Untitled sketch', width, height, paper: 'plain', activeLayerId: layerId, updatedAt: Date.now(), layers: [{ id: layerId, name: 'Layer 1', visible: true, opacity: 1, strokes: [] }] }
}
export function filename(title: string, extension = 'png'): string {
  return `${title.normalize('NFKC').replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'DrawingPad'}.${extension}`
}
export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
}
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
function invalid(): never { throw new Error('This drawing file is invalid or exceeds the sketchbook limits.') }
/** Validate stored/imported data before it reaches canvas allocation or rendering. */
export function validateDrawing(value: unknown): Drawing {
  if (!value || typeof value !== 'object') return invalid()
  const d = value as Drawing
  if (d.version !== 1 || !isId(d.id) || typeof d.title !== 'string' || d.title.length > 100 || !validCanvasSize(d.width, d.height) || !finite(d.updatedAt, 0, Number.MAX_SAFE_INTEGER)) return invalid()
  if (!['plain', 'cream', 'ruled', 'grid', 'transparent'].includes(d.paper) || !Array.isArray(d.layers) || d.layers.length < 1 || d.layers.length > MAX_LAYERS) return invalid()
  const ids = new Set<string>()
  let total = 0
  for (const layer of d.layers) {
    if (!layer || !isId(layer.id) || ids.has(layer.id) || typeof layer.name !== 'string' || layer.name.length > 60 || typeof layer.visible !== 'boolean' || !finite(layer.opacity, 0, 1) || !Array.isArray(layer.strokes) || layer.strokes.length > 2000) return invalid()
    ids.add(layer.id)
    for (const stroke of layer.strokes) {
      if (!stroke || !isId(stroke.id) || !['ink', 'pencil', 'marker', 'blend', 'eraser'].includes(stroke.tool) || !/^#[a-f0-9]{6}$/i.test(stroke.color) || !finite(stroke.size, 1, 120) || !finite(stroke.opacity, 0.01, 1) || !finite(stroke.smoothing, 0, 1) || typeof stroke.pressure !== 'boolean' || (stroke.penSmoothing !== undefined && stroke.penSmoothing !== 1) || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > MAX_STROKE_POINTS) return invalid()
      total += stroke.points.length
      if (total > MAX_POINTS) return invalid()
      for (const point of stroke.points) {
        if (!Array.isArray(point) || point.length < 3 || point.length > 4 || !finite(point[0], -4096, Math.max(6144, d.width + 4096)) || !finite(point[1], -4096, Math.max(6144, d.height + 4096)) || !finite(point[2], 0, 1) || (point.length === 4 && !finite(point[3], 0, 1))) return invalid()
      }
    }
  }
  if (!ids.has(d.activeLayerId)) return invalid()
  if (new TextEncoder().encode(JSON.stringify(d)).byteLength > MAX_DOCUMENT_BYTES) return invalid()
  return d
}
/** History stores immutable document references; strokes are never edited in place. */
export class DrawingHistory {
  private past: Drawing[] = []
  private future: Drawing[] = []
  constructor(public current: Drawing) {}
  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  replace(drawing: Drawing) { this.current = drawing; this.past = []; this.future = [] }
  commit(drawing: Drawing) {
    this.past.push(this.current)
    if (this.past.length > 40) this.past.shift()
    this.future = []
    this.current = { ...drawing, updatedAt: Date.now() }
  }
  undo() { const drawing = this.past.pop(); if (drawing) { this.future.push(this.current); this.current = { ...drawing, updatedAt: Date.now() } }; return this.current }
  redo() { const drawing = this.future.pop(); if (drawing) { this.past.push(this.current); this.current = { ...drawing, updatedAt: Date.now() } }; return this.current }
}
