import { describe, expect, test } from 'bun:test'
import type { BackendBridge } from '../src/bridge'
import { createDrawing, type Drawing, type DrawingSummary } from '../src/model'
import { DraftSaver } from '../src/saver'

const summary = (drawing: Drawing): DrawingSummary => ({ id: drawing.id, title: drawing.title, width: drawing.width, height: drawing.height, updatedAt: drawing.updatedAt, previewVersion: '' })
describe('draft saving', () => {
  test('overlapping flushes do not duplicate the same snapshot and pending edits coalesce', async () => {
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve }), writes: Drawing[] = []
    const bridge = { call: async (_action: string, value: { drawing: Drawing }) => {
      writes.push(value.drawing)
      if (writes.length === 1) await blocked
      return summary(value.drawing)
    } } as unknown as BackendBridge
    const saver = new DraftSaver(bridge, () => undefined, () => undefined), first = createDrawing()
    const saving = saver.enqueue(first, '')
    const duplicate = saver.enqueue(first, '')
    const intermediate = { ...first, title: 'Partially typed' }, latest = { ...first, title: 'Final title' }
    saver.enqueue(intermediate, ''); saver.enqueue(latest, '')
    release(); await Promise.all([saving, duplicate, saver.flush()])
    expect(writes).toEqual([first, latest])
  })
  test('failed writes retain the latest snapshot for retry', async () => {
    let fail = true
    const writes: Drawing[] = []
    const bridge = { call: async (_action: string, value: { drawing: Drawing }) => {
      if (fail) throw new Error('Offline')
      writes.push(value.drawing); return summary(value.drawing)
    } } as unknown as BackendBridge
    const saver = new DraftSaver(bridge, () => undefined, () => undefined), drawing = createDrawing()
    await expect(saver.enqueue(drawing, '')).rejects.toThrow('Offline')
    fail = false; await saver.flush()
    expect(writes).toEqual([drawing])
  })
})
