import { expect, test } from 'bun:test'
import { angleDelta, cameraAtPoint, pageToScreen, screenToPage, softSnapRotation, zoomAround } from '../src/input'
import { TwoFingerTap } from '../src/touch-undo'

const radians = (degrees: number) => degrees * Math.PI / 180
test('two-finger undo fires once after both short contacts lift, in either order', () => {
  for (const first of [1, 2]) {
    const tap = new TwoFingerTap()
    tap.down(1, 20, 30, 0); tap.down(2, 70, 80, 50)
    tap.move(1, 22, 32)
    expect(tap.up(first, first === 1 ? 22 : 70, first === 1 ? 32 : 80, 100)).toBe(false)
    const second = first === 1 ? 2 : 1
    expect(tap.up(second, second === 1 ? 22 : 70, second === 1 ? 32 : 80, 150)).toBe(true)
    expect(tap.up(second, 20, 30, 160)).toBe(false)
    tap.down(3, 0, 0, 200); tap.down(4, 50, 0, 220)
    expect(tap.up(3, 0, 0, 240)).toBe(false); expect(tap.up(4, 50, 0, 260)).toBe(true)
  }
})
test('navigation, holds, extra fingers, canceled contacts, and single touches never undo', () => {
  for (const scenario of ['pan', 'pinch', 'hold', 'late', 'third', 'replacement', 'cancel', 'single']) {
    const tap = new TwoFingerTap()
    tap.down(1, 0, 0, 0)
    if (scenario !== 'single') tap.down(2, 50, 0, scenario === 'late' ? 180 : 50)
    if (scenario === 'pan') tap.move(1, 10, 0)
    if (scenario === 'pinch') tap.move(2, 60, 0)
    if (scenario === 'third') { tap.down(3, 80, 0, 70); tap.up(3, 80, 0, 90) }
    if (scenario === 'replacement') { tap.up(1, 0, 0, 80); tap.down(3, 80, 0, 90); tap.up(3, 80, 0, 100) }
    if (scenario === 'cancel') tap.cancel(1)
    expect(tap.up(1, 0, 0, 100)).toBe(false)
    expect(tap.up(2, 50, 0, scenario === 'hold' ? 400 : 200)).toBe(false)
  }
})
test('rotated drawing coordinates match the CSS transform and invert in every quadrant', () => {
  const quarter = { x: 100, y: 200, scale: 2, rotation: Math.PI / 2 }
  const known = pageToScreen(30, 40, quarter)
  expect(known[0]).toBeCloseTo(20, 10); expect(known[1]).toBeCloseTo(260, 10)
  for (const degrees of [0, 90, 180, 270, 360, -45, 757]) {
    const camera = { x: -120, y: 83, scale: 0.23, rotation: radians(degrees) }
    for (const [x, y] of [[0, 0], [8000, 1000], [-150, 97]]) {
      const screen = pageToScreen(x!, y!, camera), page = screenToPage(...screen, camera)
      expect(page[0]).toBeCloseTo(x!, 8); expect(page[1]).toBeCloseTo(y!, 8)
    }
    const anchored = cameraAtPoint(1.2, radians(degrees), 730, 460, 340, 220)
    const screen = pageToScreen(730, 460, anchored)
    expect(screen[0]).toBeCloseTo(340, 8); expect(screen[1]).toBeCloseTo(220, 8)
  }
})
test('zooming a rotated view keeps the anchor and angle while enforcing the zoom bounds', () => {
  const camera = { x: 35, y: -70, scale: 0.7, rotation: radians(137) }
  const before = screenToPage(250, 350, camera)
  for (const scale of [1.6, 20, -1]) {
    const updated = zoomAround(camera, scale, 250, 350), after = screenToPage(250, 350, updated)
    expect(after[0]).toBeCloseTo(before[0], 7); expect(after[1]).toBeCloseTo(before[1], 7)
    expect(updated.rotation).toBe(camera.rotation)
    expect(updated.scale).toBeGreaterThanOrEqual(0.000001); expect(updated.scale).toBeLessThanOrEqual(8)
  }
})
test('quarter turns have a narrow exact snap and a continuous, reversible magnetic shoulder', () => {
  for (const degrees of [-450, -360, -90, 0, 90, 180, 270, 360, 810]) {
    const target = radians(degrees)
    for (const direction of [-1, 1]) {
      expect(softSnapRotation(target + radians(2.5 * direction))).toBeCloseTo(target, 10)
      expect(softSnapRotation(target + radians(6 * direction))).toBeCloseTo(target + radians(3 * direction), 10)
      expect(softSnapRotation(target + radians(12 * direction))).toBeCloseTo(target + radians(12 * direction), 10)
    }
  }
  for (const boundary of [3, 9]) expect(Math.abs(softSnapRotation(radians(boundary + 0.00001)) - softSnapRotation(radians(boundary - 0.00001)))).toBeLessThan(0.000001)
  let previous = 0
  for (let degrees = 0; degrees <= 15; degrees += 0.1) {
    const snapped = softSnapRotation(radians(degrees))
    expect(snapped).toBeGreaterThanOrEqual(previous)
    previous = snapped
  }
  expect(angleDelta(radians(-358))).toBeCloseTo(radians(2), 10)
  expect(angleDelta(radians(358))).toBeCloseTo(radians(-2), 10)
})
