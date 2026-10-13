import { expect, test } from 'bun:test'
import { hexToHsv, hsvToHex, normalizeHex } from '../src/color-picker'

test('hex input accepts shorthand and rejects malformed colors', () => {
  expect(normalizeHex(' #ABC ')).toBe('#aabbcc')
  expect(normalizeHex('1a73e8')).toBe('#1a73e8')
  expect(normalizeHex('#zzzzzz')).toBeNull()
  expect(normalizeHex('#12345')).toBeNull()
})
test('the full spectrum includes hue endpoints and saturation/brightness extremes', () => {
  expect(hsvToHex([0, 1, 1])).toBe('#ff0000')
  expect(hsvToHex([120, 1, 1])).toBe('#00ff00')
  expect(hsvToHex([240, 1, 1])).toBe('#0000ff')
  expect(hsvToHex([360, 1, 1])).toBe('#ff0000')
  expect(hsvToHex([200, 0, 1])).toBe('#ffffff')
  expect(hsvToHex([200, 1, 0])).toBe('#000000')
})
test('arbitrary RGB colors round-trip without quantization loss', () => {
  for (const hex of ['#000000', '#ffffff', '#23202b', '#1a73e8', '#ff80a0', '#01fe02', '#888888']) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
})
