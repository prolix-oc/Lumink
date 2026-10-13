import { describe, expect, test } from 'bun:test'
import { applyColorMutations, emptyPalette, validatePalette } from '../src/palette'
import { PaletteStore } from '../src/palette-store'
import type { BackendBridge } from '../src/bridge'

describe('color palettes', () => {
  test('history holds the last 18 distinct colors in most-recent order', () => {
    const colors = Array.from({ length: 20 }, (_, i) => `#${(0x102000 + i).toString(16)}`)
    const palette = applyColorMutations(emptyPalette(), colors.map(color => ({ type: 'use', color })))
    expect(palette.recent).toEqual(colors.slice(-18).reverse())
    const reused = applyColorMutations(palette, [{ type: 'use', color: colors[5] }])
    expect(reused.recent[0]).toBe(colors[5]!)
    expect(reused.recent).toHaveLength(18)
    expect(new Set(reused.recent).size).toBe(18)
  })
  test('saved colors stay pinned when history rolls over and removal leaves history intact', () => {
    let palette = applyColorMutations(emptyPalette(), [{ type: 'save', color: '#ABC' }, { type: 'save', color: '#aabbcc' }, { type: 'use', color: '#ABC' }])
    expect(palette.saved).toEqual(['#aabbcc'])
    palette = applyColorMutations(palette, Array.from({ length: 20 }, (_, i) => ({ type: 'use', color: `#${(0x203000 + i).toString(16)}` })))
    expect(palette.saved).toEqual(['#aabbcc'])
    expect(palette.recent).not.toContain('#aabbcc')
    const removed = applyColorMutations(palette, [{ type: 'remove', color: '#ABC' }])
    expect(removed.saved).toEqual([])
    expect(removed.recent).toEqual(palette.recent)
    expect(palette.saved).toEqual(['#aabbcc'])
  })
  test('malformed palettes and color mutations are rejected', () => {
    expect(() => validatePalette({ version: 1, recent: ['<script>'], saved: [] })).toThrow()
    expect(() => validatePalette({ version: 1, recent: Array(19).fill('#ffffff'), saved: [] })).toThrow()
    expect(() => applyColorMutations(emptyPalette(), [{ type: 'save', color: '#zzzzzz' }])).toThrow()
    expect(() => applyColorMutations(emptyPalette(), [{ type: 'delete-account', color: '#ffffff' }])).toThrow()
  })
  test('changes made before account colors load merge without losing saved swatches', async () => {
    let resolveLoad!: (value: unknown) => void
    const loading = new Promise(resolve => { resolveLoad = resolve })
    let account = applyColorMutations(emptyPalette(), [{ type: 'save', color: '#123456' }]), writes = 0
    const bridge = { call: async (action: string, data?: { mutations: unknown }) => {
      if (action === 'load-colors') return loading
      writes++; account = applyColorMutations(account, data!.mutations); return account
    } } as unknown as BackendBridge
    const store = new PaletteStore(bridge)
    store.use('#abc'); store.save('#fedcba')
    expect(writes).toBe(0)
    resolveLoad(account)
    await store.flush()
    expect(writes).toBe(1)
    expect(account.recent).toEqual(['#aabbcc'])
    expect(account.saved).toEqual(['#123456', '#fedcba'])
    await store.destroy()
  })
  test('a failed color save keeps mutations for an explicit retry', async () => {
    let account = emptyPalette(), fail = true
    const bridge = { call: async (action: string, data?: { mutations: unknown }) => {
      if (action === 'load-colors') return account
      if (fail) throw new Error('Offline')
      account = applyColorMutations(account, data!.mutations); return account
    } } as unknown as BackendBridge
    const store = new PaletteStore(bridge)
    store.save('#123456')
    await expect(store.flush()).rejects.toThrow('Offline')
    fail = false; await store.flush()
    expect(account.saved).toEqual(['#123456'])
    await store.destroy()
  })
})
