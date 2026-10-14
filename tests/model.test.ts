import { describe, expect, test } from 'bun:test'
import { createDrawing, DrawingHistory, filename, validateDrawing, canvasSizeError, MAX_CANVAS_PIXELS, type Stroke } from '../src/model'
import { previewSize } from '../src/canvas'
import { realSamples, screenToPage, zoomAround } from '../src/input'
import { strokeOutline } from '../src/renderer'
const stroke = (pressure = 0.5, tilt = 0): Stroke => ({ id: crypto.randomUUID(), tool: 'ink', color: '#23202b', size: 20, opacity: 1, smoothing: 0.25, pressure: true, points: [[100, 100, pressure, tilt], [200, 100, pressure, tilt]] })
describe('drawing documents', () => {
  test('custom dimensions use an export memory budget instead of fixed side bounds', () => {
    const drawing = validateDrawing(JSON.parse(JSON.stringify(createDrawing(1366, 768))))
    expect([drawing.width, drawing.height]).toEqual([1366, 768])
    for (const [width, height] of [[0, 768], [-1, 768], [1024.5, 768], [1024, NaN], [4097, 4096], [Number.MAX_SAFE_INTEGER + 1, 1]]) expect(() => createDrawing(width!, height!)).toThrow()
    for (const [width, height] of [[1, 1], [255, 768], [8000, 1000], [2480, 3508], [3840, 2160], [4096, 4096]]) {
      const restored = validateDrawing(createDrawing(width!, height!))
      expect([restored.width, restored.height]).toEqual([width!, height!])
    }
    expect(MAX_CANVAS_PIXELS).toBe(16_777_216)
    expect(canvasSizeError(5000, 5000)).toContain('128 MiB')
  })
  test('wide documents preserve pen coordinates beyond the old canvas bounds', () => {
    const drawing = createDrawing(8000, 1000)
    drawing.layers[0]!.strokes.push({ ...stroke(), points: [[7200, 500, 0.5]] })
    expect(validateDrawing(JSON.parse(JSON.stringify(drawing))).layers[0]!.strokes[0]!.points[0]![0]).toBe(7200)
  })
  test('large canvas previews stay bounded and preserve the page aspect', () => {
    expect(previewSize(1200, 900)).toEqual({ width: 1200, height: 900 })
    expect(previewSize(8000, 1000)).toEqual({ width: 2048, height: 256 })
    const a4 = previewSize(2480, 3508)
    expect(a4.height).toBe(2048)
    expect(a4.width / a4.height).toBeCloseTo(2480 / 3508, 3)
    expect(previewSize(1, 4096).width).toBe(1)
  })
  test('rejects malformed input before allocating canvas memory', () => {
    expect(validateDrawing(createDrawing()).version).toBe(1)
    expect(() => validateDrawing({ ...createDrawing(), width: 100_000 })).toThrow()
    const d = createDrawing(); d.layers[0]!.strokes.push({ ...stroke(), points: [[NaN, 0, 0.5]] })
    expect(() => validateDrawing(d)).toThrow()
    expect(() => validateDrawing({ ...createDrawing(), activeLayerId: '../../config' })).toThrow()
  })
  test('documents round-trip beyond the former page, stroke, stroke-count, and file-size caps', () => {
    const drawing = createDrawing()
    drawing.layers[0]!.strokes = [
      { ...stroke(), points: Array.from({ length: 125_000 }, () => [100.25, 200.75, 0.555, 0.123]) },
      ...Array.from({ length: 2001 }, () => stroke()),
    ]
    const json = JSON.stringify(drawing)
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(3_000_000)
    const restored = validateDrawing(JSON.parse(json))
    expect(restored.layers[0]!.strokes).toHaveLength(2002)
    expect(restored.layers[0]!.strokes[0]!.points).toHaveLength(125_000)
  })
  test('selection moves survive editable files and reject malformed or out-of-order operations', () => {
    const drawing = createDrawing(), layer = drawing.layers[0]!
    layer.strokes = [stroke(), stroke()]
    const move = { strokeIndex: 1, polygon: [[90, 90], [210, 90], [210, 110], [90, 110]] as [number, number][], offset: [35, -50] as [number, number] }
    layer.selectionMoves = [move, { ...move, strokeIndex: 2 }]
    expect(validateDrawing(JSON.parse(JSON.stringify(drawing))).layers[0]!.selectionMoves).toEqual(layer.selectionMoves)
    for (const invalid of [{ ...move, strokeIndex: -1 }, { ...move, strokeIndex: 3 }, { ...move, strokeIndex: 0.5 }, { ...move, offset: [NaN, 5] }, { ...move, polygon: [[0, 0], [10, 10]] }]) {
      expect(() => validateDrawing({ ...drawing, layers: [{ ...layer, selectionMoves: [invalid] }] })).toThrow()
    }
    expect(() => validateDrawing({ ...drawing, layers: [{ ...layer, selectionMoves: [{ ...move, strokeIndex: 2 }, move] }] })).toThrow()
  })
  test('undo/redo preserve strokes and branching discards redo', () => {
    const d = createDrawing(), history = new DrawingHistory(d), mark = stroke()
    history.commit({ ...d, layers: [{ ...d.layers[0]!, strokes: [mark] }] })
    expect(d.layers[0]!.strokes).toHaveLength(0)
    history.commit({ ...history.current, layers: [{ ...history.current.layers[0]!, strokes: [] }] })
    expect(history.undo().layers[0]!.strokes[0]).toBe(mark)
    expect(history.redo().layers[0]!.strokes).toHaveLength(0)
    history.undo(); history.commit({ ...history.current, paper: 'grid' })
    expect(history.canRedo).toBe(false)
  })
  test('filenames retain readable text and remove path characters', () => {
    expect(filename('../my: sketch / 🎨')).toBe('my-sketch.png')
    expect(filename('')).toBe('DrawingPad.png')
  })
})
describe('precision input', () => {
  test('zoom keeps the page coordinate under the pointer fixed', () => {
    const camera = { x: 20, y: -30, scale: 0.8, rotation: 0 }
    const before = screenToPage(100, 150, camera)
    const after = screenToPage(100, 150, zoomAround(camera, 2.5, 100, 150))
    expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1])
  })
  test('uses coalesced events once and falls back for older/insecure browsers', () => {
    const samples = [{} as PointerEvent, {} as PointerEvent]
    const event = { getCoalescedEvents: () => samples } as PointerEvent
    expect(realSamples(event)).toBe(samples)
    const empty = { getCoalescedEvents: () => [] } as unknown as PointerEvent
    expect(realSamples(empty)).toEqual([empty])
    const legacy = {} as PointerEvent
    expect(realSamples(legacy)).toEqual([legacy])
  })
  test('pressure changes ink width and tilt broadens pencil shading', () => {
    const width = (points: number[][]) => Math.max(...points.map(p => p[1]!)) - Math.min(...points.map(p => p[1]!))
    expect(width(strokeOutline(stroke(0.9)))).toBeGreaterThan(width(strokeOutline(stroke(0.1))))
    expect(width(strokeOutline({ ...stroke(0.5, 0.8), tool: 'pencil' }))).toBeGreaterThan(width(strokeOutline({ ...stroke(0.5, 0), tool: 'pencil' })))
  })
})
