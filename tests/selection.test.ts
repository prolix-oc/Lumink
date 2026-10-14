import { expect, test } from 'bun:test'
import { insidePolygon, polygonBounds, translatePolygon } from '../src/selection'
import type { PagePoint } from '../src/model'

test('freehand hit testing excludes a concave cutout and follows the moved selection', () => {
  const polygon: PagePoint[] = [[10, 10], [90, 10], [90, 30], [30, 30], [30, 90], [10, 90]]
  expect(insidePolygon([20, 60], polygon)).toBe(true)
  expect(insidePolygon([60, 20], polygon)).toBe(true)
  expect(insidePolygon([60, 60], polygon)).toBe(false)
  expect(insidePolygon([5, 20], polygon)).toBe(false)
  const moved = translatePolygon(polygon, [100, -20])
  expect(polygonBounds(moved)).toEqual({ left: 110, top: -10, right: 190, bottom: 70 })
  expect(insidePolygon([120, 40], moved)).toBe(true)
  expect(insidePolygon([20, 60], moved)).toBe(false)
  expect(polygon[0]).toEqual([10, 10])
})
