import { expect, test } from 'bun:test'
import { galleryWindow, GALLERY_ROW_HEIGHT } from '../src/catalog'
import { LruCache } from '../src/gallery'

test('gallery windows stay bounded at the start, middle, end, and across responsive column changes', () => {
  for (const width of [1, 290, 390, 1280, 2400]) {
    for (const total of [0, 1, 49, 1000, 100_000]) {
      const first = galleryWindow(width, 600, 0, total)
      expect(first.start).toBe(0)
      expect(first.end - first.start).toBeLessThanOrEqual(first.columns * (Math.ceil(600 / GALLERY_ROW_HEIGHT) + 3))
      const middle = galleryWindow(width, 600, first.height / 2, total)
      expect(middle.start % middle.columns).toBe(0)
      expect(middle.end).toBeLessThanOrEqual(total)
      const last = galleryWindow(width, 600, Math.max(0, first.height - 600), total)
      expect(last.end).toBe(total)
      expect(last.end - last.start).toBeLessThanOrEqual(last.columns * (Math.ceil(600 / GALLERY_ROW_HEIGHT) + 3))
    }
  }
})
test('bounded caches retain recently viewed pages and release old previews', () => {
  const cache = new LruCache<number, string>(3)
  cache.set(1, 'a'); cache.set(2, 'b'); cache.set(3, 'c')
  expect(cache.get(1)).toBe('a')
  cache.set(4, 'd')
  expect(cache.size).toBe(3); expect(cache.get(2)).toBeUndefined()
  cache.set(1, 'updated'); expect(cache.get(1)).toBe('updated')
  cache.delete(1); expect(cache.get(1)).toBeUndefined()
  cache.clear(); expect(cache.size).toBe(0)
})
