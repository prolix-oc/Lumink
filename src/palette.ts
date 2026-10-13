import { normalizeHex } from './color'

export const RECENT_COLOR_LIMIT = 18
export const SAVED_COLOR_LIMIT = 256
export interface ColorPalette { version: 1; recent: string[]; saved: string[] }
export interface ColorMutation { type: 'use' | 'save' | 'remove'; color: string }
export const emptyPalette = (): ColorPalette => ({ version: 1, recent: [], saved: [] })

export function validatePalette(value: unknown): ColorPalette {
  const palette = value as ColorPalette
  if (!palette || palette.version !== 1 || !Array.isArray(palette.recent) || !Array.isArray(palette.saved) || palette.recent.length > RECENT_COLOR_LIMIT || palette.saved.length > SAVED_COLOR_LIMIT) throw new Error('This color palette is invalid.')
  const colors = (values: unknown[]) => [...new Set(values.map(value => {
    const hex = typeof value === 'string' ? normalizeHex(value) : null
    if (!hex) throw new Error('This color palette contains an invalid color.')
    return hex
  }))]
  return { version: 1, recent: colors(palette.recent), saved: colors(palette.saved) }
}
export function applyColorMutations(palette: ColorPalette, mutations: unknown): ColorPalette {
  if (!Array.isArray(mutations) || mutations.length > 256) throw new Error('Invalid color changes.')
  let next = validatePalette(palette)
  for (const value of mutations) {
    const mutation = value as ColorMutation
    const color = typeof mutation?.color === 'string' ? normalizeHex(mutation.color) : null
    if (!color || !['use', 'save', 'remove'].includes(mutation.type)) throw new Error('Invalid color change.')
    if (mutation.type === 'use') next = { ...next, recent: [color, ...next.recent.filter(hex => hex !== color)].slice(0, RECENT_COLOR_LIMIT) }
    if (mutation.type === 'save' && !next.saved.includes(color)) {
      if (next.saved.length >= SAVED_COLOR_LIMIT) throw new Error('Your saved palette is full. Remove a saved color before adding another.')
      next = { ...next, saved: [...next.saved, color] }
    }
    if (mutation.type === 'remove') next = { ...next, saved: next.saved.filter(hex => hex !== color) }
  }
  return next
}
