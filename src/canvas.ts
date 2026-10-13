import { canvasSizeError } from './model'

export function previewSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 2048 / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
export function releaseCanvas(canvas: HTMLCanvasElement) { canvas.width = 1; canvas.height = 1 }

/** Test the actual allocation, including its last pixel, rather than guessing from browser names. */
export function browserCanvasError(width: number, height: number): string | null {
  const error = canvasSizeError(width, height)
  if (error) return error
  const canvas = document.createElement('canvas')
  try {
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No canvas context')
    context.fillStyle = '#7b2d43'; context.fillRect(width - 1, height - 1, 1, 1)
    const pixel = context.getImageData(width - 1, height - 1, 1, 1).data
    if (pixel[0] !== 123 || pixel[1] !== 45 || pixel[2] !== 67 || pixel[3] !== 255) throw new Error('Canvas allocation failed')
    return null
  } catch { return `This browser could not allocate a ${width} × ${height} PNG canvas. Try a smaller size.` }
  finally { releaseCanvas(canvas) }
}
