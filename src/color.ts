/** Canonical color values shared by the picker, palette, and backend validation. */
export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '')
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map(digit => digit + digit).join('').toLowerCase()}`
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null
}
