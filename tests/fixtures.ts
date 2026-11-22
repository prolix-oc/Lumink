import type { SpindleFrontendUUIDAPI } from 'lumiverse-spindle-types'

let nextId = 0
const id = (version: 4 | 7) => `00000000-0000-${version}000-8000-${(++nextId).toString(16).padStart(12, '0')}`
export const uuid: SpindleFrontendUUIDAPI = { v4: () => id(4), v7: () => id(7) }
