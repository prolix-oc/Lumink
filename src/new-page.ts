import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { canvasSizeError, EXPORT_BYTES_PER_PIXEL, EXPORT_MEMORY_BUDGET } from './model'
import { browserCanvasError } from './canvas'

export interface CanvasSize { width: number; height: number }
const presets = [
  { name: 'Landscape', width: 1200, height: 900 },
  { name: 'Portrait', width: 900, height: 1200 },
  { name: 'Square', width: 2048, height: 2048 },
  { name: 'A4', width: 2480, height: 3508 },
  { name: 'Letter', width: 2550, height: 3300 },
  { name: 'Widescreen', width: 3840, height: 2160 },
]

/** Used both before the first workspace opens and when starting another page. */
export function chooseCanvasSize(ctx: SpindleFrontendContext, initial: CanvasSize = { width: 1200, height: 900 }): Promise<CanvasSize | null> {
  return new Promise(resolve => {
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lumiverse-ui-scale')) || 1
    const modal = ctx.ui.showModal({ title: 'New canvas', width: 640, maxHeight: Math.max(240, window.innerHeight / scale - 32) })
    modal.root.innerHTML = `<form class="dp-new"><p>Pick a page for your next idea.</p><div class="dp-presets" role="group" aria-label="Canvas presets">${presets.map((preset, index) => {
      const ratio = preset.width / preset.height
      return `<button type="button" data-new="preset" data-preset="${index}" aria-pressed="false"><span class="dp-paper-preview" aria-hidden="true"><span class="dp-paper-shape" style="width:${Math.min(1, ratio) * 100}%;height:${Math.min(1, 1 / ratio) * 100}%"></span><span class="dp-preset-check">✓</span></span><strong>${preset.name}</strong><small>${preset.width} × ${preset.height} px</small></button>`
    }).join('')}</div><div class="dp-custom-heading"><button type="button" data-new="custom" aria-pressed="false">Custom size</button><span>Dimensions in pixels</span></div><div class="dp-dimensions"><label>Width <span class="dp-number-slot" data-dimension="width"></span></label><label>Height <span class="dp-number-slot" data-dimension="height"></span></label></div><div class="dp-size-details"><p class="dp-size-summary" role="status" aria-live="polite"></p><small class="dp-memory-estimate"></small></div><div class="dp-new-actions"><button type="button" data-new="cancel">Cancel</button><button type="submit" data-new="create" class="dp-primary">Create canvas</button></div></form>`
    const presetButtons = [...modal.root.querySelectorAll<HTMLButtonElement>('[data-preset]')]
    const custom = modal.root.querySelector<HTMLButtonElement>('[data-new="custom"]')!
    const submit = modal.root.querySelector<HTMLButtonElement>('[data-new="create"]')!
    const summary = modal.root.querySelector<HTMLElement>('.dp-size-summary')!
    const memory = modal.root.querySelector<HTMLElement>('.dp-memory-estimate')!
    let width: number | null = initial.width, height: number | null = initial.height, settled = false, checking = false, customSelected = false
    const update = (allocationError?: string | null) => {
      const error = allocationError || canvasSizeError(width, height)
      const match = presets.findIndex(preset => preset.width === width && preset.height === height)
      presetButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(!customSelected && index === match)))
      custom.setAttribute('aria-pressed', String(customSelected || match === -1))
      submit.disabled = checking || !!error
      submit.textContent = checking ? 'Checking canvas…' : 'Create canvas'
      summary.textContent = error || `${width} × ${height} px · ${((width! * height!) / 1_000_000).toFixed(2)} megapixels`
      summary.dataset.error = String(!!error)
      const bytes = width! * height! * EXPORT_BYTES_PER_PIXEL
      memory.textContent = width && height && width > 0 && height > 0 && Number.isFinite(bytes) ? `PNG working memory: ${(bytes / 1024 / 1024).toFixed(1)} MiB of ${EXPORT_MEMORY_BUDGET / 1024 / 1024} MiB` : 'The browser will check this size before creating your canvas.'
    }
    const numeric = { min: 1, step: 1, integer: true, allowEmpty: true }
    const widthField = ctx.components.mountNumericInput(modal.root.querySelector<HTMLElement>('[data-dimension="width"]')!, { ...numeric, value: width, ariaLabel: 'Canvas width in pixels', onChange: value => { width = value; customSelected = false; update() } })
    const heightField = ctx.components.mountNumericInput(modal.root.querySelector<HTMLElement>('[data-dimension="height"]')!, { ...numeric, value: height, ariaLabel: 'Canvas height in pixels', onChange: value => { height = value; customSelected = false; update() } })
    const finish = (size: CanvasSize | null) => { if (!settled) { settled = true; resolve(size) } }
    modal.onDismiss(() => { widthField.destroy(); heightField.destroy(); finish(null) })
    modal.root.querySelector('[data-new="cancel"]')!.addEventListener('click', () => modal.dismiss())
    custom.addEventListener('click', () => { customSelected = true; update(); widthField.focus() })
    presetButtons.forEach((button, index) => button.addEventListener('click', () => {
      const preset = presets[index]!
      width = preset.width; height = preset.height; customSelected = false
      widthField.update({ value: width }); heightField.update({ value: height }); update()
    }))
    modal.root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); modal.dismiss() } })
    modal.root.querySelector('form')!.addEventListener('submit', async event => {
      event.preventDefault()
      if (checking || settled) return
      width = widthField.getValue(); height = heightField.getValue(); update()
      if (canvasSizeError(width, height)) return
      const chosen = { width: width!, height: height! }
      checking = true; update()
      widthField.update({ disabled: true }); heightField.update({ disabled: true })
      for (const button of [...presetButtons, custom]) button.disabled = true
      // Allow the checking state to paint before asking the browser to allocate pixels.
      await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
      if (settled) return
      const error = browserCanvasError(chosen.width, chosen.height)
      if (!error) { finish(chosen); modal.dismiss(); return }
      checking = false
      widthField.update({ disabled: false }); heightField.update({ disabled: false })
      for (const button of [...presetButtons, custom]) button.disabled = false
      update(error)
    })
    update(); (presetButtons.find(button => button.getAttribute('aria-pressed') === 'true') ?? custom).focus()
  })
}
