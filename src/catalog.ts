import type { DrawingSummary } from './model'

export const CATALOG_PAGE_SIZE = 64
export const GALLERY_GAP = 12
export const GALLERY_CARD_HEIGHT = 172
export const GALLERY_ROW_HEIGHT = GALLERY_CARD_HEIGHT + GALLERY_GAP
export interface CatalogPage {
  entries: DrawingSummary[]
  offset: number
  total: number
  revision: string
  reset: boolean
}
export interface ThumbnailPreview { thumbnail: string; previewVersion: string }
export interface DrawingIndex { version: 2; revision: string; entries: DrawingSummary[] }

/** Layout pixels also work when the host applies its UI scale. */
export function galleryWindow(width: number, height: number, scrollTop: number, total: number) {
  const columns = Math.max(1, Math.floor((width + GALLERY_GAP) / (140 + GALLERY_GAP)))
  const rows = Math.ceil(total / columns)
  const firstRow = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / GALLERY_ROW_HEIGHT)) - 1)
  const lastRow = Math.min(rows, Math.ceil((scrollTop + height) / GALLERY_ROW_HEIGHT) + 1)
  return { columns, start: firstRow * columns, end: Math.min(total, Math.max(firstRow, lastRow) * columns), top: firstRow * GALLERY_ROW_HEIGHT, height: Math.max(0, rows * GALLERY_ROW_HEIGHT - GALLERY_GAP) }
}

export function summaryOf(entry: DrawingSummary & { thumbnail?: string }): DrawingSummary {
  return { id: entry.id, title: entry.title, width: entry.width, height: entry.height, updatedAt: entry.updatedAt, previewVersion: entry.previewVersion ?? String(entry.updatedAt) }
}
export function readIndex(value: DrawingIndex | DrawingSummary[]): DrawingIndex {
  if (!Array.isArray(value)) return { ...value, entries: value.entries.map(summaryOf) }
  const entries = value.map(summaryOf)
  // A deterministic revision detects changes to an old array index before its next save.
  let hash = 2166136261
  for (const char of JSON.stringify(entries)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return { version: 2, revision: `legacy-${hash >>> 0}`, entries }
}
