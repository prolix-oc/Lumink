import { getStroke } from 'perfect-freehand'
import type { Drawing, Layer, Stroke, Point, PagePoint, SelectionMove } from './model'
import { previewSize, releaseCanvas } from './canvas'
import { BlendBrush } from './blend'
import { polygonBounds } from './selection'

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  return canvas
}
function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('DrawingPad needs a browser with Canvas 2D support.')
  return ctx
}
function polygonPath(ctx: CanvasRenderingContext2D, polygon: PagePoint[]) {
  ctx.beginPath(); ctx.moveTo(...polygon[0]!)
  for (const point of polygon.slice(1)) ctx.lineTo(...point)
  ctx.closePath()
}
/** Copy just the selected rectangle, clipped to its freehand loop. */
function selectionCutout(ctx: CanvasRenderingContext2D, polygon: PagePoint[]) {
  const bounds = polygonBounds(polygon), transform = ctx.getTransform(), sx = transform.a, sy = transform.d
  const left = Math.max(0, Math.floor(bounds.left * sx)), top = Math.max(0, Math.floor(bounds.top * sy))
  const right = Math.min(ctx.canvas.width, Math.ceil(bounds.right * sx)), bottom = Math.min(ctx.canvas.height, Math.ceil(bounds.bottom * sy))
  if (right <= left || bottom <= top) return null
  const canvas = makeCanvas(right - left, bottom - top), cutout = context(canvas)
  cutout.setTransform(sx, 0, 0, sy, -left, -top)
  polygonPath(cutout, polygon); cutout.clip('evenodd')
  cutout.drawImage(ctx.canvas, 0, 0, ctx.canvas.width / sx, ctx.canvas.height / sy)
  return { canvas, left: left / sx, top: top / sy, width: canvas.width / sx, height: canvas.height / sy }
}
export function paintSelectionMove(ctx: CanvasRenderingContext2D, move: SelectionMove) {
  if (move.offset[0] === 0 && move.offset[1] === 0) return
  const cutout = selectionCutout(ctx, move.polygon)
  if (!cutout) return
  try {
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out'
    polygonPath(ctx, move.polygon); ctx.fill('evenodd')
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(cutout.canvas, cutout.left + move.offset[0], cutout.top + move.offset[1], cutout.width, cutout.height)
    ctx.restore()
  } finally { releaseCanvas(cutout.canvas) }
}
function paintLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  let moveIndex = 0
  for (let index = 0; index <= layer.strokes.length; index++) {
    while (layer.selectionMoves?.[moveIndex]?.strokeIndex === index) paintSelectionMove(ctx, layer.selectionMoves[moveIndex++]!)
    if (layer.strokes[index]) paintStroke(ctx, layer.strokes[index]!)
  }
}
export function strokeOutline(stroke: Stroke, points = stroke.points, complete = true) {
  const pencil = stroke.tool === 'pencil'
  const input = points.map(([x, y, pressure, tilt = 0]) => [x, y, pencil ? Math.min(1, (stroke.pressure ? pressure : 0.5) * 0.65 + tilt * 0.5) : pressure])
  return getStroke(input, {
    size: stroke.size * (pencil ? 1.35 : 1),
    thinning: stroke.tool === 'eraser' || stroke.tool === 'marker' ? 0 : pencil ? 0.65 : stroke.pressure ? 0.65 : 0,
    smoothing: 0.55,
    streamline: stroke.penSmoothing === 1 ? 0 : stroke.smoothing,
    simulatePressure: false,
    last: complete,
  })
}
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, points = stroke.points, complete = true) {
  if (stroke.tool === 'blend') {
    const brush = new BlendBrush(ctx, stroke)
    try { brush.append(points); if (complete) brush.finish() } finally { brush.destroy() }
    return
  }
  const outline = strokeOutline(stroke, points, complete)
  if (!outline.length) return
  ctx.save()
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.globalAlpha = stroke.tool === 'eraser' ? 1 : stroke.opacity * (stroke.tool === 'marker' ? 0.35 : stroke.tool === 'pencil' ? 0.8 : 1)
  ctx.fillStyle = stroke.color
  ctx.beginPath()
  const first = outline[0]!
  ctx.moveTo(first[0]!, first[1]!)
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!, b = outline[(i + 1) % outline.length]!
    ctx.quadraticCurveTo(a[0]!, a[1]!, (a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2)
  }
  ctx.closePath(); ctx.fill(); ctx.restore()
}
function paintPaper(ctx: CanvasRenderingContext2D, drawing: Drawing) {
  if (drawing.paper === 'transparent') return
  ctx.fillStyle = drawing.paper === 'cream' ? '#fff7e7' : '#ffffff'
  ctx.fillRect(0, 0, drawing.width, drawing.height)
  if (drawing.paper !== 'grid' && drawing.paper !== 'ruled') return
  ctx.strokeStyle = drawing.paper === 'ruled' ? '#dce5ef' : '#e7e9ed'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let y = 40.5; y < drawing.height; y += 40) { ctx.moveTo(0, y); ctx.lineTo(drawing.width, y) }
  if (drawing.paper === 'grid') for (let x = 40.5; x < drawing.width; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, drawing.height) }
  ctx.stroke()
  if (drawing.paper === 'ruled') {
    ctx.strokeStyle = '#efc3c5'; ctx.beginPath(); ctx.moveTo(80.5, 0); ctx.lineTo(80.5, drawing.height); ctx.stroke()
  }
}
/** Cache committed layers. Only the current stroke is regenerated while drawing. */
export class DrawingRenderer {
  private cache = new Map<string, { strokes: Stroke[]; moves: SelectionMove[] | undefined; canvas: HTMLCanvasElement }>()
  private scratch: HTMLCanvasElement
  private drawing: Drawing
  private exportQueue: Promise<void> = Promise.resolve()
  private destroyed = false
  private blendPreview: { id: string; layerId: string; source: HTMLCanvasElement; count: number; brush: BlendBrush } | null = null
  constructor(public readonly canvas: HTMLCanvasElement, drawing: Drawing) {
    this.drawing = drawing
    this.scratch = makeCanvas(1, 1)
    this.setDrawing(drawing)
  }
  setDrawing(drawing: Drawing) {
    this.clearBlendPreview()
    const size = previewSize(drawing.width, drawing.height)
    if (drawing.width !== this.drawing.width || drawing.height !== this.drawing.height || size.width !== this.canvas.width || size.height !== this.canvas.height || size.width !== this.scratch.width || size.height !== this.scratch.height) {
      for (const cached of this.cache.values()) releaseCanvas(cached.canvas)
      this.cache.clear()
      this.canvas.width = size.width; this.canvas.height = size.height
      this.scratch.width = size.width; this.scratch.height = size.height
    }
    this.drawing = drawing
    for (const [id, cached] of this.cache) if (!drawing.layers.some(layer => layer.id === id)) { releaseCanvas(cached.canvas); this.cache.delete(id) }
    this.render()
  }
  private layerCanvas(layer: Layer) {
    const cached = this.cache.get(layer.id)
    if (cached?.strokes === layer.strokes && cached.moves === layer.selectionMoves) return cached.canvas
    const canvas = cached?.canvas ?? makeCanvas(this.canvas.width, this.canvas.height)
    const ctx = context(canvas)
    ctx.setTransform(canvas.width / this.drawing.width, 0, 0, canvas.height / this.drawing.height, 0, 0)
    // A new stroke can be appended without replaying the entire layer.
    const appended = cached && cached.moves === layer.selectionMoves && layer.strokes.length === cached.strokes.length + 1 && cached.strokes.every((stroke, i) => stroke === layer.strokes[i])
    const moved = cached && cached.strokes === layer.strokes && layer.selectionMoves && layer.selectionMoves.length === (cached.moves?.length ?? 0) + 1 && (cached.moves ?? []).every((move, i) => move === layer.selectionMoves![i]) && layer.selectionMoves.at(-1)!.strokeIndex === layer.strokes.length
    if (appended) paintStroke(ctx, layer.strokes.at(-1)!)
    else if (moved) paintSelectionMove(ctx, layer.selectionMoves!.at(-1)!)
    else { ctx.clearRect(0, 0, this.drawing.width, this.drawing.height); paintLayer(ctx, layer) }
    this.cache.set(layer.id, { strokes: layer.strokes, moves: layer.selectionMoves, canvas })
    return canvas
  }
  hasSelection(layerId: string, polygon: PagePoint[]) {
    const layer = this.drawing.layers.find(layer => layer.id === layerId)
    if (!layer) return false
    const cutout = selectionCutout(context(this.layerCanvas(layer)), polygon)
    if (!cutout) return false
    try {
      const pixels = context(cutout.canvas).getImageData(0, 0, cutout.canvas.width, cutout.canvas.height).data
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) return true
      return false
    } finally { releaseCanvas(cutout.canvas) }
  }
  render(preview?: { layerId: string; stroke: Stroke; predicted?: Point[] }, selection?: { layerId: string; move: SelectionMove }) {
    if (preview?.stroke.tool !== 'blend') this.clearBlendPreview()
    const ctx = context(this.canvas)
    ctx.setTransform(this.canvas.width / this.drawing.width, 0, 0, this.canvas.height / this.drawing.height, 0, 0)
    ctx.clearRect(0, 0, this.drawing.width, this.drawing.height)
    paintPaper(ctx, this.drawing)
    for (const layer of this.drawing.layers) {
      if (!layer.visible) continue
      let source = this.layerCanvas(layer)
      if (preview?.layerId === layer.id) {
        const scratch = context(this.scratch)
        const blend = preview.stroke.tool === 'blend'
        if (!blend || this.blendPreview?.id !== preview.stroke.id || this.blendPreview.source !== source || this.blendPreview.layerId !== layer.id) {
          this.clearBlendPreview()
          scratch.setTransform(this.scratch.width / this.drawing.width, 0, 0, this.scratch.height / this.drawing.height, 0, 0)
          scratch.clearRect(0, 0, this.drawing.width, this.drawing.height)
          scratch.drawImage(source, 0, 0, this.drawing.width, this.drawing.height)
          if (blend) this.blendPreview = { id: preview.stroke.id, layerId: layer.id, source, count: 0, brush: new BlendBrush(scratch, preview.stroke) }
        }
        if (blend) {
          const current = this.blendPreview!
          // Only confirmed additions touch the reservoir. Predictions never alter pixels.
          current.brush.append(preview.stroke.points.slice(current.count)); current.count = preview.stroke.points.length
        } else {
          const points = preview.predicted?.length ? [...preview.stroke.points, ...preview.predicted] : preview.stroke.points
          paintStroke(scratch, preview.stroke, points, false)
        }
        source = this.scratch
      }
      if (selection?.layerId === layer.id) {
        const scratch = context(this.scratch)
        scratch.setTransform(this.scratch.width / this.drawing.width, 0, 0, this.scratch.height / this.drawing.height, 0, 0)
        scratch.clearRect(0, 0, this.drawing.width, this.drawing.height)
        scratch.drawImage(source, 0, 0, this.drawing.width, this.drawing.height)
        paintSelectionMove(scratch, selection.move); source = this.scratch
      }
      ctx.save(); ctx.globalAlpha = layer.opacity; ctx.drawImage(source, 0, 0, this.drawing.width, this.drawing.height); ctx.restore()
    }
  }
  png(): Promise<Blob> {
    const drawing = this.drawing
    // Serialize encoding so old requests cannot keep several large exports alive.
    const task = this.exportQueue.then(() => this.exportPng(drawing))
    this.exportQueue = task.then(() => undefined, () => undefined)
    return task
  }
  private async exportPng(drawing: Drawing): Promise<Blob> {
    if (this.destroyed) throw new Error('DrawingPad was closed.')
    const output = makeCanvas(drawing.width, drawing.height)
    let layerCanvas: HTMLCanvasElement | undefined
    try {
      const ctx = context(output)
      paintPaper(ctx, drawing)
      for (const layer of drawing.layers) {
        if (!layer.visible || !layer.strokes.length) continue
        layerCanvas ??= makeCanvas(drawing.width, drawing.height)
        const layerContext = context(layerCanvas)
        layerContext.clearRect(0, 0, drawing.width, drawing.height)
        paintLayer(layerContext, layer)
        ctx.save(); ctx.globalAlpha = layer.opacity; ctx.drawImage(layerCanvas, 0, 0); ctx.restore()
      }
      // Replay strokes and blend operations at the requested resolution.
      return await new Promise<Blob>((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('This browser could not create the PNG. Try a smaller canvas.')), 'image/png'))
    } finally { releaseCanvas(output); if (layerCanvas) releaseCanvas(layerCanvas) }
  }
  thumbnail() {
    this.render()
    const scale = 180 / Math.max(this.drawing.width, this.drawing.height)
    const canvas = makeCanvas(Math.max(1, Math.round(this.drawing.width * scale)), Math.max(1, Math.round(this.drawing.height * scale)))
    const ctx = context(canvas)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(this.canvas, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png'); releaseCanvas(canvas); return data
  }
  private clearBlendPreview() { this.blendPreview?.brush.destroy(); this.blendPreview = null }
  destroy() { this.destroyed = true; this.clearBlendPreview(); for (const cached of this.cache.values()) releaseCanvas(cached.canvas); this.cache.clear(); releaseCanvas(this.scratch); releaseCanvas(this.canvas) }
}
