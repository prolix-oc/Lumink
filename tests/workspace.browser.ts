import { chromium, webkit, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createDrawing, type Drawing } from '../src/model'

const project = resolve(import.meta.dir, '..'), results = resolve(project, 'test-results')
const base = 'http://127.0.0.1:4818'
const server = Bun.spawn(['bun', 'run', 'scripts/demo-server.ts'], { cwd: project, env: { ...process.env, DRAWINGPAD_DEMO_PORT: '4818' }, stdout: 'pipe', stderr: 'pipe' })
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function open(page: Page) {
  await page.goto(base)
  await page.getByRole('button', { name: 'Open DrawingPad', exact: true }).click()
  if (await page.locator('.dp-new').isVisible()) await page.getByRole('button', { name: 'Create canvas', exact: true }).click()
  await page.locator('.dp-viewport').waitFor()
}
async function saved(page: Page): Promise<Drawing> {
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.dp-save-state')?.dataset.state === 'saved')
  return page.evaluate(() => (window as any).drawingpadDemo.drawings()[0].drawing)
}
async function stroke(page: Page, points: [number, number][], end = 'pointerup', inspect: [number, number][] = []) {
  return page.locator('.dp-viewport').evaluate(async (viewport, { points, end, inspect }) => {
    const bounds = viewport.getBoundingClientRect(), sheet = viewport.querySelector<HTMLElement>('.dp-sheet')!, matrix = new DOMMatrix(sheet.style.transform)
    let preview: number[][] = []
    for (let index = 0; index <= points.length; index++) {
      const point = new DOMPoint(...points[Math.min(index, points.length - 1)]!).matrixTransform(matrix)
      const type = index === 0 ? 'pointerdown' : index === points.length ? end : 'pointermove'
      viewport.dispatchEvent(new PointerEvent(type, { pointerId: 91, pointerType: 'pen', bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : 0.5, clientX: bounds.left + point.x * bounds.width / viewport.clientWidth, clientY: bounds.top + point.y * bounds.height / viewport.clientHeight }))
      if (index === points.length - 1) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const canvas = viewport.querySelector('canvas')!, ctx = canvas.getContext('2d')!
        preview = inspect.map(([x, y]) => [...ctx.getImageData(Math.round(x * canvas.width / sheet.offsetWidth), Math.round(y * canvas.height / sheet.offsetHeight), 1, 1).data])
      }
    }
    return preview
  }, { points, end, inspect })
}
async function pixels(page: Page, positions: [number, number][]) {
  return page.locator('.dp-sheet canvas').evaluate((element, positions) => {
    const canvas = element as HTMLCanvasElement, sheet = element.parentElement!, ctx = canvas.getContext('2d')!
    return positions.map(([x, y]) => [...ctx.getImageData(Math.round(x * canvas.width / sheet.offsetWidth), Math.round(y * canvas.height / sheet.offsetHeight), 1, 1).data])
  }, positions)
}
async function gesture(page: Page, rotate = false) {
  return page.locator('.dp-viewport').evaluate((viewport, rotate) => {
    const rect = viewport.getBoundingClientRect(), sheet = viewport.querySelector<HTMLElement>('.dp-sheet')!, before = sheet.style.transform
    const x = viewport.clientWidth / 2, y = viewport.clientHeight / 2
    const send = (type: string, id: number, dx: number, dy: number) => viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: rect.left + (x + dx) * rect.width / viewport.clientWidth, clientY: rect.top + (y + dy) * rect.height / viewport.clientHeight }))
    send('pointerdown', 81, -60, 0); send('pointerdown', 82, 60, 0)
    if (rotate) { send('pointermove', 81, 0, -75); send('pointermove', 82, 0, 75) }
    else { send('pointermove', 81, -59, 1); send('pointermove', 82, 61, 1) }
    send('pointerup', 81, rotate ? 0 : -59, rotate ? -75 : 1)
    const midRedo = !(document.querySelector('[data-action="redo"]') as HTMLButtonElement).disabled
    send('pointerup', 82, rotate ? 0 : 61, rotate ? 75 : 1)
    return { midRedo, before, after: sheet.style.transform }
  }, rotate)
}
async function check(page: Page, label: string) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await open(page)
  await page.getByLabel('Paper', { exact: true }).selectOption('transparent')
  await page.getByLabel('Stroke stabilization', { exact: true }).fill('0')
  await page.getByLabel('Brush size', { exact: true }).fill('24')
  await page.getByRole('checkbox', { name: 'Pressure', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Choose color', exact: true }).click()
  await page.getByLabel('Color brightness', { exact: true }).fill('100')
  await page.getByRole('slider', { name: 'Color wheel', exact: true }).evaluate(wheel => {
    const bounds = wheel.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup']) wheel.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 77, clientX: bounds.right, clientY: bounds.top + bounds.height / 2 }))
  })
  assert(await page.getByLabel('Hex color', { exact: true }).inputValue() === '#ff0000', 'The wheel did not select red')
  await stroke(page, [[200, 300], [800, 300]])
  assert(await page.locator('.dp-color-picker').isVisible(), 'Drawing dismissed the floating color panel')
  await page.getByRole('button', { name: 'Close color picker', exact: true }).click()
  await saved(page)
  const tap = await gesture(page)
  assert(!tap.midRedo && tap.before === tap.after, 'Two-finger undo fired early or changed the view')
  assert(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), 'Two-finger tap did not undo')
  assert((await pixels(page, [[400, 300]]))[0]![3] === 0, 'Undo retained the stroke')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Pen only', exact: true }).check()
  await gesture(page)
  assert((await pixels(page, [[400, 300]]))[0]![3] === 0, 'Pen only blocked two-finger undo')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Pen only', exact: true }).uncheck()
  if (await page.locator('.dp-layers').isHidden()) await page.getByRole('button', { name: 'Toggle layers', exact: true }).click()
  await page.getByRole('button', { name: 'Add layer', exact: true }).click()
  await stroke(page, [[200, 500], [800, 500]])
  await page.getByRole('button', { name: 'Layer 1', exact: true }).click()
  await page.getByRole('button', { name: 'Close layers', exact: true }).click()
  await page.getByRole('button', { name: 'eraser', exact: true }).click()
  await page.getByLabel('Brush size', { exact: true }).fill('8')
  await stroke(page, [[400, 300], [400, 300]])
  await saved(page)
  const rotation = await gesture(page, true)
  assert(rotation.before !== rotation.after && await page.getByRole('button', { name: 'Redo', exact: true }).isDisabled(), 'Rotation triggered undo')
  await page.getByRole('button', { name: 'lasso', exact: true }).click()
  await stroke(page, [[350, 250], [450, 250], [450, 350], [350, 350], [350, 250]])
  assert(await page.getByRole('button', { name: 'Done', exact: true }).isVisible(), 'The lasso did not select artwork')
  const preview = await stroke(page, [[400, 310], [400, 410]], 'pointercancel', [[410, 300], [410, 400]])
  assert(preview[0]![3] === 0 && preview[1]![3] === 255, 'Dragging did not preview the move')
  assert((await pixels(page, [[410, 300], [410, 400]]))[0]![3] === 255, 'Canceling a move changed committed artwork')
  await stroke(page, [[400, 310], [400, 410]])
  const moved = await saved(page), move = moved.layers[0]!.selectionMoves?.[0]
  assert(move && Math.abs(move.offset[1] - 100) < 0.1 && Math.abs(move.offset[0]) < 0.1, 'Rotated input moved the wrong page coordinates')
  assert(moved.layers[0]!.strokes.length === 2 && !moved.layers[1]!.selectionMoves, 'The lasso changed strokes or another layer')
  const sample = await pixels(page, [[200, 300], [410, 300], [410, 400], [400, 400], [400, 500]])
  assert(sample[0]![0] === 255 && sample[0]![3] === 255 && sample[1]![3] === 0 && sample[2]![0] === 255 && sample[2]![3] === 255 && sample[3]![3] === 0 && sample[4]![3] === 255, 'The move did not preserve partial strokes, erased pixels, or the other layer')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert((await pixels(page, [[410, 300], [410, 400]]))[0]![3] === 255, 'Undo did not restore the selected pixels')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await saved(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as any).__selectionExport = data.files![0] } })
  })
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click()
  await page.waitForFunction(() => (window as any).__selectionExport)
  const imagePath = resolve(results, `selection-${label}.png`)
  const bytes = await page.evaluate(async () => [...new Uint8Array(await (window as any).__selectionExport.arrayBuffer())])
  await Bun.write(imagePath, new Uint8Array(bytes))
  const exported = await page.evaluate(async bytes => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); image.close()
    return [[410, 300], [410, 400], [400, 400]].map(([x, y]) => [...ctx.getImageData(x!, y!, 1, 1).data])
  }, [...bytes])
  assert(exported[0]![3] === 0 && exported[1]![0] === 255 && exported[1]![3] === 255 && exported[2]![3] === 0, 'PNG replay did not preserve the selection move')
  await page.getByRole('button', { name: 'Fullscreen canvas', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle layers', exact: true }).click()
  assert(await page.locator('.dp-layers').isVisible(), 'Fullscreen hid the floating layers')
  await page.getByRole('button', { name: 'Hide Layer 1', exact: true }).click()
  assert((await pixels(page, [[410, 400]]))[0]![3] === 0, 'Floating layer visibility did not update the canvas')
  await page.getByRole('button', { name: 'Show Layer 1', exact: true }).click()
  await page.getByRole('button', { name: 'Close layers', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle floating colors', exact: true }).click()
  await page.getByLabel('Move color panel', { exact: true }).evaluate(heading => {
    const rect = heading.getBoundingClientRect(), x = rect.left + 20, y = rect.top + 10
    for (const [type, dx, dy] of [['pointerdown', 0, 0], ['pointermove', -40, 50], ['pointerup', -40, 50]] as const) heading.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 75, clientX: x + dx, clientY: y + dy }))
  })
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  await page.getByLabel('Color hue', { exact: true }).fill('120')
  await page.getByRole('button', { name: 'Disc', exact: true }).click()
  await page.getByLabel('Color brightness', { exact: true }).fill('50')
  assert(await page.getByLabel('Hex color', { exact: true }).inputValue() === '#008000', 'Disc and Classic did not share color state')
  await page.getByRole('button', { name: 'Toggle layers', exact: true }).click()
  assert(await page.locator('.dp-layers').evaluate(el => el.style.zIndex === '9') && await page.locator('.dp-color-picker').evaluate(el => el.style.zIndex === '8'), 'Opening layers did not bring them above floating colors')
  await page.getByLabel('Move layers panel', { exact: true }).evaluate(heading => {
    const rect = heading.getBoundingClientRect()
    for (const [type, x, y] of [['pointerdown', rect.left + 20, rect.top + 8], ['pointermove', -2000, 2000], ['pointerup', -2000, 2000]] as const) heading.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', pointerId: 74, clientX: x, clientY: y }))
  })
  const layerBounds = await page.locator('.dp-layers').boundingBox(), screen = page.viewportSize()!
  assert(layerBounds && layerBounds.x >= 0 && layerBounds.y >= 0 && layerBounds.x + layerBounds.width <= screen.width + 1 && layerBounds.y + layerBounds.height <= screen.height + 1, 'Dragging lost the layers panel off-screen')
  await page.getByRole('button', { name: 'Close layers', exact: true }).click()
  const panel = await page.locator('.dp-color-picker').boundingBox(), viewport = page.viewportSize()!
  assert(panel && await page.locator('.dp-color-picker').evaluate(el => (el as HTMLElement).offsetWidth <= 250) && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= viewport.width + 1 && panel.y + panel.height <= viewport.height + 1, 'The compact floating color panel extends beyond the viewport')
  await page.screenshot({ path: resolve(results, `floating-${label}.png`), fullPage: true })
  await page.getByRole('button', { name: 'Close DrawingPad', exact: true }).click()
  await open(page)
  assert((await pixels(page, [[410, 300], [410, 400]]))[1]![3] === 255, 'Reopening lost the selection move')
  assert((await saved(page)).layers[0]!.selectionMoves?.length === 1, 'The editable move did not persist')
  await page.getByRole('button', { name: 'lasso', exact: true }).click()
  await stroke(page, [[700, 700], [750, 700], [750, 750], [700, 750], [700, 700]])
  assert(await page.locator('.dp-selection-toolbar').isHidden(), 'An empty area became a selection')
  assert(!errors.length, `Browser errors: ${errors.join(', ')}`)
  console.log(`${label}: two-finger undo, navigation, rotated partial-stroke lasso, erased pixels, active-layer isolation, cancel, undo/redo, PNG and editable replay, floating colors/layers, and wheel/classic synchronization passed.`)
}
try {
  await mkdir(results, { recursive: true })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fetch(base).then(response => response.ok).catch(() => false)) break
    if (attempt === 99) throw new Error('Demo server did not start.')
    await Bun.sleep(100)
  }
  for (const browserType of [chromium, webkit]) {
    const browser = await browserType.launch({ headless: true })
    try {
      for (const viewport of [{ width: 1200, height: 1000 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: true })
        try { await check(await context.newPage(), `${browserType.name()}-${viewport.width}`) } finally { await context.close() }
      }
      const scaled = await browser.newContext({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true })
      try {
        const page = await scaled.newPage()
        await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.setProperty('--lumiverse-ui-scale', '1.5')
          document.documentElement.style.setProperty('--app-scaled-viewport-width', `${window.innerWidth / 1.5}px`)
          document.documentElement.style.setProperty('--app-scaled-viewport-height', `${window.innerHeight / 1.5}px`)
          document.body.style.zoom = '1.5'; document.body.style.width = `${window.innerWidth / 1.5}px`
        }))
        await check(page, `${browserType.name()}-scaled`)
      } finally { await scaled.close() }
      const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } })
      try {
        const page = await context.newPage(), drawing = createDrawing()
        drawing.layers[0]!.strokes = [{ id: crypto.randomUUID(), tool: 'ink', color: '#23202b', size: 8, opacity: 1, smoothing: 0, pressure: false, points: Array.from({ length: 125_000 }, () => [100.25, 200.75, 0.555, 0.123]) }]
        const summary = { id: drawing.id, title: drawing.title, width: drawing.width, height: drawing.height, updatedAt: drawing.updatedAt }
        await page.addInitScript(({ drawing, summary }) => localStorage.setItem('drawingpad-demo', JSON.stringify({ 'drawings/index.json': JSON.stringify([summary]), [`drawings/${drawing.id}.json`]: JSON.stringify({ drawing }) })), { drawing, summary })
        await open(page)
        await page.getByLabel('Stroke stabilization', { exact: true }).fill('0')
        await page.locator('.dp-viewport').evaluate(viewport => {
          const rect = viewport.getBoundingClientRect(), point = new DOMPoint(300, 300).matrixTransform(new DOMMatrix(viewport.querySelector<HTMLElement>('.dp-sheet')!.style.transform))
          const sample = (type: string, index: number) => new PointerEvent(type, { bubbles: true, pointerType: 'pen', pointerId: 90, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : 0.5, clientX: rect.left + point.x + index % 2 * 5, clientY: rect.top + point.y })
          viewport.dispatchEvent(sample('pointerdown', 0))
          const move = sample('pointermove', 1)
          Object.defineProperty(move, 'getCoalescedEvents', { value: () => Array.from({ length: 12_100 }, (_, i) => sample('pointermove', i + 1)) })
          viewport.dispatchEvent(move); viewport.dispatchEvent(sample('pointerup', 0))
        })
        const updated = await saved(page)
        assert(updated.layers[0]!.strokes.length === 2 && updated.layers[0]!.strokes[1]!.points.length > 12_000, 'A full page or long stroke is still capped')
        console.log(`${browserType.name()}: pages above 3 MB and 125,000 points accept and save strokes longer than 12,000 points.`)
      } finally { await context.close() }
    } finally { await browser.close() }
  }
} finally { server.kill(); await server.exited }
