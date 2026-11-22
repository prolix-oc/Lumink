import type { SpindleFrontendContext, SpindleFrontendUUIDAPI } from 'lumiverse-spindle-types'

export type UUIDFrontendContext = SpindleFrontendContext & { readonly uuid: SpindleFrontendUUIDAPI }

export function requireFrontendUuid(ctx: SpindleFrontendContext): UUIDFrontendContext {
  if (!ctx.uuid || (ctx.host.capabilities['frontend-uuid-v1'] ?? 0) < 1) {
    throw new Error('DrawingPad requires UUID generation support (frontend-uuid-v1). Update Lumiverse.')
  }
  return ctx as UUIDFrontendContext
}
