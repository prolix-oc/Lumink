import { expect, test } from 'bun:test'
import { angleDelta, cameraAtPoint, pageToScreen, screenToPage, softSnapRotation, zoomAround } from '../src/input'

const radians = (degrees: number) => degrees * Math.PI / 180
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
