import { expect, test } from 'bun:test'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { BackendBridge } from '../src/bridge'
import { setup } from '../src/frontend'
import { createBackendHandler, type Reply, type Request } from '../src/backend-handler'
import { createDrawing, validateDrawing } from '../src/model'
import { requireFrontendUuid } from '../src/uuid'
import { uuid } from './fixtures'

test('frontend UUID support requires both the capability and API before mounting UI', () => {
  for (const context of [
    { host: { capabilities: { 'uuid-v1': 1 } } },
    { host: { capabilities: { 'frontend-uuid-v1': 1 } } },
    { host: { capabilities: { 'uuid-v1': 1 } }, uuid },
  ]) {
    expect(() => setup(context as unknown as SpindleFrontendContext)).toThrow('frontend-uuid-v1')
  }
  const context = { host: { capabilities: { 'frontend-uuid-v1': 1 } }, uuid } as unknown as SpindleFrontendContext
  expect(requireFrontendUuid(context) === context).toBe(true)
})

test('drawing IDs from the synchronous host API survive validation and editable JSON', () => {
  const ids = [uuid.v4(), uuid.v4()]
  const drawing = createDrawing({ v4: () => ids.shift()! }, 1366, 768)
  expect(ids).toHaveLength(0)
  expect(drawing.id).not.toBe(drawing.activeLayerId)
  expect(validateDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing)
})

test('bridge requests use synchronous host UUID v7 values and correlate replies', async () => {
  let reply!: (payload: Reply) => void
  const requestId = uuid.v7()
  const ctx = requireFrontendUuid({
    host: { capabilities: { 'frontend-uuid-v1': 1 } },
    uuid: { v4: () => { throw new Error('Expected v7') }, v7: () => requestId },
    onBackendMessage: (handler: typeof reply) => { reply = handler; return () => undefined },
    sendToBackend: (request: Request) => {
      expect(request.requestId).toBe(requestId)
      reply({ type: 'drawingpad-reply', requestId, ok: true, result: 'saved' })
    },
  } as unknown as SpindleFrontendContext)
  const bridge = new BackendBridge(ctx)
  try { expect(await bridge.call<string>('save')).toBe('saved') }
  finally { bridge.destroy() }
})

test('backend UUID capability errors explain the required host update', () => {
  expect(() => createBackendHandler({ host: { capabilities: {} } } as Parameters<typeof createBackendHandler>[0])).toThrow('uuid-v1')
})

test('the bundled frontend avoids the blocked browser UUID API, including dependencies', async () => {
  const result = await Bun.build({ entrypoints: [new URL('../src/frontend.ts', import.meta.url).pathname], target: 'browser', minify: true })
  expect(result.success).toBe(true)
  expect(await result.outputs[0]!.text()).not.toContain('randomUUID')
})
