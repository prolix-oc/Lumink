import type { SpindleAPI } from 'lumiverse-spindle-types'
import { createBackendHandler } from './backend-handler'
declare const spindle: SpindleAPI
spindle.onFrontendMessage(createBackendHandler(spindle))
spindle.log.info('DrawingPad ready')
