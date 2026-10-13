import { expect, test } from 'bun:test'
import { PenSmoother } from '../src/smoothing'
import { BrushDabs } from '../src/blend'
import { createDrawing, validateDrawing, type Point, type Stroke } from '../src/model'
import { strokeOutline } from '../src/renderer'

test('adaptive pen stabilization suppresses slow jitter, stays responsive at speed, and honors Steady', () => {
  const noise = (strength: number) => {
    const filter = new PenSmoother(strength)
    let sum = 0
    for (let i = 0; i < 240; i++) {
      const point = filter.push([i * 0.2, Math.sin(i * Math.PI / 2), 0.5, 0], i * 1000 / 240)
      if (i > 30) sum += point[1] ** 2
    }
    return Math.sqrt(sum / 209)
  }
  expect(noise(0.25)).toBeLessThan(noise(0) * 0.3)
  expect(noise(0.85)).toBeLessThan(noise(0.25) * 0.4)
  for (const strength of [0.25, 0.6, 0.85]) {
    const filter = new PenSmoother(strength)
    let point: Point = [0, 0, 0.5]
    for (let i = 0; i < 50; i++) point = filter.push([i * 5, 0, 0.5], i * 1000 / 120)
    expect(245 - point[0]).toBeLessThan(4)
    expect(filter.finish()![0]).toBe(245)
  }
  const off = new PenSmoother(0)
  for (let i = 0; i < 10; i++) expect(off.push([i, i % 2, i / 10, i / 20], i * 8)).toEqual([i, i % 2, i / 10, i / 20])
})

test('pen filtering smooths pressure and tilt without mutating samples or losing tap location', () => {
  const filter = new PenSmoother(0.6), first: Point = [10, 20, 0.2, 0.1], next: Point = [11, 20, 0.9, 0.8]
  expect(filter.push(first, 100)).toEqual(first)
  const result = filter.push(next, 104)
  expect(result[2]).toBeGreaterThan(0.2); expect(result[2]).toBeLessThan(0.9)
  expect(result[3]!).toBeGreaterThan(0.1); expect(result[3]!).toBeLessThan(0.8)
  expect(first).toEqual([10, 20, 0.2, 0.1]); expect(next).toEqual([11, 20, 0.9, 0.8])
  expect(filter.finish()!.slice(0, 2)).toEqual([11, 20])
  const tap = new PenSmoother(0.85); tap.push(first, 0); expect(tap.finish()).toEqual(first)
})

test('prediction filtering uses a clone and stale/duplicate samples do not shift confirmed state', () => {
  const confirmed = new PenSmoother(0.6), control = new PenSmoother(0.6)
  for (const filter of [confirmed, control]) { filter.push([0, 0, 0.5], 0); filter.push([10, 1, 0.6], 8) }
  const before = confirmed.finish()
  confirmed.clone().push([1000, 1000, 1], 16)
  expect(confirmed.finish()).toEqual(before)
  expect(confirmed.push([10, 1, 0.6], 8)).toEqual(control.push([10, 1, 0.6], 8))
  confirmed.push([-500, -500, 0], 2)
  expect(confirmed.push([20, 2, 0.7], 16)).toEqual(control.push([20, 2, 0.7], 16))
})

test('a held pen settles toward its contact position after a sharp movement', () => {
  const filter = new PenSmoother(0.85)
  filter.push([0, 0, 0.5], 0)
  const moving = filter.push([20, 10, 0.8], 8)
  let held = moving
  for (let t = 16; t <= 400; t += 8) held = filter.push([20, 10, 0.8], t)
  expect(Math.hypot(20 - held[0], 10 - held[1])).toBeLessThan(Math.hypot(20 - moving[0], 10 - moving[1]) * 0.05)
  expect(held[2]).toBeCloseTo(0.8, 3)
})

test('pen filtering behaves consistently at different sample rates, rotation, and displayed scale', () => {
  const end = (rate: number) => {
    const filter = new PenSmoother(0.6)
    let result: Point = [0, 0, 0.5]
    for (let i = 0; i <= rate; i++) result = filter.push([i * 200 / rate, i * 100 / rate, 0.5], i * 1000 / rate)
    return result
  }
  const reference = end(120)
  for (const rate of [60, 240]) expect(Math.hypot(end(rate)[0] - reference[0], end(rate)[1] - reference[1])).toBeLessThan(0.25)
  const normal = new PenSmoother(0.5), zoomed = new PenSmoother(0.5, 2), rotated = new PenSmoother(0.5)
  for (let i = 0; i < 50; i++) {
    const x = i * 2, y = Math.sin(i / 3) * 2, t = i * 8
    const a = normal.push([x, y, 0.5], t), b = zoomed.push([x / 2, y / 2, 0.5], t), c = rotated.push([-y, x, 0.5], t)
    expect(b[0] * 2).toBeCloseTo(a[0], 10); expect(b[1] * 2).toBeCloseTo(a[1], 10)
    expect(c[0]).toBeCloseTo(-a[1], 10); expect(c[1]).toBeCloseTo(a[0], 10)
  }
})

test('blend spacing and pressure interpolation are independent of sample density and preview batches', () => {
  const path = (points: Point[], chunked = false) => {
    const result: Point[] = [], dabs = new BrushDabs(3, p => result.push(p))
    if (chunked) for (const point of points) dabs.append([point]); else dabs.append(points)
    dabs.finish(); dabs.finish()
    return result
  }
  const sparse: Point[] = [[0, 0, 0.2], [30, 0, 0.8]], dense: Point[] = Array.from({ length: 31 }, (_, x) => [x, 0, 0.2 + x * 0.02])
  const a = path(sparse), b = path(dense, true)
  expect(a).toHaveLength(11); expect(b).toHaveLength(11)
  a.forEach((point, i) => point.forEach((value, j) => expect(b[i]![j]!).toBeCloseTo(value!, 10)))
  const corner = path([[0, 0, 0.5], [4, 0, 0.5], [4, 4, 0.5]])
  expect(corner.map(p => p.slice(0, 2))).toEqual([[0, 0], [3, 0], [4, 2], [4, 4]])
  expect(path([[10, 20, 0.5], [10, 20, 0.5]])).toHaveLength(1)
})

test('editable blend strokes round-trip and older stroke geometry keeps its original streamline', () => {
  const drawing = createDrawing(), stroke: Stroke = { id: crypto.randomUUID(), tool: 'blend', color: '#abcdef', size: 48, opacity: 0.6, smoothing: 0.25, pressure: true, penSmoothing: 1, points: [[10, 20, 0.5], [100, 20, 0.8]] }
  drawing.layers[0]!.strokes.push(stroke)
  expect(validateDrawing(JSON.parse(JSON.stringify(drawing))).layers[0]!.strokes[0]).toEqual(stroke)
  expect(() => validateDrawing({ ...drawing, layers: [{ ...drawing.layers[0], strokes: [{ ...stroke, penSmoothing: 2 }] }] })).toThrow()
  const ink = { ...stroke, tool: 'ink' as const }, legacy = { ...ink, penSmoothing: undefined }
  expect(strokeOutline(ink)).toEqual(strokeOutline({ ...legacy, smoothing: 0 }))
  expect(strokeOutline(legacy)).not.toEqual(strokeOutline(ink))
})
