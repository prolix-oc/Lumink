import { clamp } from './model'
import { icon } from './icons'
import { emptyPalette, SAVED_COLOR_LIMIT, type ColorPalette } from './palette'
import { normalizeHex } from './color'
export { normalizeHex } from './color'

export type HSV = [hue: number, saturation: number, value: number]
export function hexToHsv(hex: string): HSV {
  const normalized = normalizeHex(hex)
  if (!normalized) throw new Error('Enter a hex color such as #7565bb.')
  const [r, g, b] = [1, 3, 5].map(start => parseInt(normalized.slice(start, start + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return [(hue * 60 + 360) % 360, max === 0 ? 0 : delta / max, max]
}
export function hsvToHex([hue, saturation, value]: HSV): string {
  const h = ((hue % 360) + 360) % 360 / 60, s = clamp(saturation, 0, 1), v = clamp(value, 0, 1)
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c
  const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]
  return `#${rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

export class ColorPicker {
  private hsv: HSV = [0, 0, 0]
  private abort = new AbortController()
  private activePointer: number | null = null
  private pad: HTMLElement
  private hue: HTMLInputElement
  private hex: HTMLInputElement
  private palette = emptyPalette()
  private editingPalette = false
  constructor(private root: HTMLElement, private trigger: HTMLButtonElement, private change: (hex: string) => void, private paletteActions: { save(color: string): void; remove(color: string): void }) {
    root.innerHTML = `<div class="dp-color-heading"><strong>Color</strong><button type="button" data-color-close aria-label="Close color picker">${icon('close')}</button></div><div class="dp-color-pad" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-describedby="dp-color-help"><span class="dp-color-point"></span></div><label class="dp-hue-label">Hue<input type="range" min="0" max="360" value="0" step="1" aria-label="Color hue" class="dp-hue"></label><label class="dp-hex-label"><span class="dp-color-preview"></span>Hex<input type="text" value="#23202b" maxlength="7" spellcheck="false" autocapitalize="off" aria-label="Hex color" class="dp-hex"></label><p class="dp-color-error" role="status" hidden>Use a 3- or 6-digit hex color, such as #7565bb.</p><small id="dp-color-help">Drag to choose a color. Arrow keys adjust saturation and brightness.</small>`
    root.insertAdjacentHTML('beforeend', `<section class="dp-color-bank"><div class="dp-palette-heading"><strong>Recent colors</strong><small>Last 18 used</small></div><div class="dp-palette-grid" data-palette="recent" role="group" aria-label="Recent colors"></div><small data-palette-empty="recent">Draw to build your color history.</small></section><section class="dp-color-bank"><div class="dp-palette-heading"><strong>Saved palette</strong><button type="button" data-action="manage-colors" aria-label="Manage saved colors" aria-pressed="false">Edit</button></div><div class="dp-palette-grid" data-palette="saved" role="group" aria-label="Saved colors"></div><small data-palette-empty="saved">Save a color to keep it here.</small><button type="button" data-action="save-color" aria-label="Save current color">+ Save color</button></section><small class="dp-palette-error" role="status" hidden></small>`)
    this.pad = root.querySelector('.dp-color-pad')!
    this.hue = root.querySelector('.dp-hue')!
    this.hex = root.querySelector('.dp-hex')!
    const signal = this.abort.signal
    root.querySelector('[data-color-close]')!.addEventListener('click', () => this.close(), { signal })
    root.querySelector('[data-action="save-color"]')!.addEventListener('click', () => this.paletteActions.save(hsvToHex(this.hsv)), { signal })
    root.querySelector('[data-action="manage-colors"]')!.addEventListener('click', () => { this.editingPalette = !this.editingPalette; this.renderPalettes() }, { signal })
    root.addEventListener('click', event => {
      const remove = (event.target as Element).closest<HTMLElement>('[data-remove-color]')
      if (remove) this.paletteActions.remove(remove.dataset.removeColor!)
    }, { signal })
    this.hue.addEventListener('input', () => { this.hsv[0] = Number(this.hue.value); this.emit() }, { signal })
    const editHex = () => {
      const hex = normalizeHex(this.hex.value)
      this.hex.setAttribute('aria-invalid', String(!hex))
      root.querySelector<HTMLElement>('.dp-color-error')!.hidden = !!hex
      if (hex) { this.hsv = hexToHsv(hex); this.emit() }
    }
    this.hex.addEventListener('input', editHex, { signal })
    this.hex.addEventListener('blur', () => { if (normalizeHex(this.hex.value)) this.hex.value = hsvToHex(this.hsv) }, { signal })
    const point = (event: PointerEvent) => {
      const bounds = this.pad.getBoundingClientRect()
      this.hsv[1] = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
      this.hsv[2] = 1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
      this.emit()
    }
    this.pad.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault(); this.pad.focus({ preventScroll: true }); this.activePointer = event.pointerId
      try { this.pad.setPointerCapture(event.pointerId) } catch { /* Synthetic input has no native capture. */ }
      point(event)
    }, { signal })
    this.pad.addEventListener('pointermove', event => { if (event.pointerId === this.activePointer) point(event) }, { signal })
    const release = (event: PointerEvent) => { if (event.pointerId === this.activePointer) this.activePointer = null }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) this.pad.addEventListener(event, release as EventListener, { signal })
    this.pad.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); const step = event.shiftKey ? 0.1 : 0.01
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.hsv[1] = clamp(this.hsv[1] + (event.key === 'ArrowRight' ? step : -step), 0, 1)
      else this.hsv[2] = clamp(this.hsv[2] + (event.key === 'ArrowUp' ? step : -step), 0, 1)
      this.emit()
    }, { signal })
    document.addEventListener('pointerdown', event => { if (this.isOpen && !root.contains(event.target as Node) && !trigger.contains(event.target as Node)) this.close() }, { signal })
  }
  get isOpen() { return !this.root.hidden }
  setColor(hex: string) { this.hsv = hexToHsv(hex); this.sync() }
  setPalette(palette: ColorPalette, error: string | null = null) {
    this.palette = palette
    this.renderPalettes()
    const status = this.root.querySelector<HTMLElement>('.dp-palette-error')!
    status.hidden = !error; status.textContent = error ?? ''
  }
  private renderPalettes() {
    if (!this.palette.saved.length) this.editingPalette = false
    const focused = this.root.contains(document.activeElement) ? document.activeElement?.getAttribute('aria-label') : null
    for (const name of ['recent', 'saved'] as const) {
      const bank = this.root.querySelector<HTMLElement>(`[data-palette="${name}"]`)!
      bank.replaceChildren()
      for (const color of this.palette[name]) {
        const cell = document.createElement('div'); cell.className = 'dp-palette-cell'
        const swatch = document.createElement('button'); swatch.type = 'button'; swatch.className = 'dp-palette-swatch'; swatch.dataset.color = color
        swatch.setAttribute('aria-label', `${name === 'recent' ? 'Recent' : 'Saved'} color ${color}`); swatch.title = color
        const chip = document.createElement('span'); chip.style.background = color; chip.className = 'dp-palette-color'; swatch.append(chip); cell.append(swatch)
        if (name === 'saved' && this.editingPalette) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.removeColor = color; remove.dataset.action = 'remove-color'; remove.className = 'dp-remove-color'
          remove.setAttribute('aria-label', `Remove saved color ${color}`); remove.title = `Remove ${color}`; remove.innerHTML = icon('close'); cell.append(remove)
        }
        bank.append(cell)
      }
      this.root.querySelector<HTMLElement>(`[data-palette-empty="${name}"]`)!.hidden = this.palette[name].length > 0
    }
    const manage = this.root.querySelector<HTMLButtonElement>('[data-action="manage-colors"]')!
    manage.disabled = this.palette.saved.length === 0; manage.textContent = this.editingPalette ? 'Done' : 'Edit'; manage.setAttribute('aria-pressed', String(this.editingPalette))
    this.syncPaletteSelection()
    if (focused && !this.root.contains(document.activeElement)) {
      const replacement = [...this.root.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(button => button.getAttribute('aria-label') === focused)
      const fallback = manage.disabled ? this.root.querySelector<HTMLButtonElement>('[data-action="save-color"]')! : manage
      ;(replacement ?? fallback).focus({ preventScroll: true })
    }
  }
  private syncPaletteSelection() {
    const hex = hsvToHex(this.hsv)
    for (const swatch of this.root.querySelectorAll<HTMLElement>('[data-color]')) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === hex))
    const save = this.root.querySelector<HTMLButtonElement>('[data-action="save-color"]')!
    save.disabled = this.palette.saved.includes(hex) || this.palette.saved.length >= SAVED_COLOR_LIMIT
    save.textContent = this.palette.saved.includes(hex) ? '✓ Color saved' : '+ Save color'
  }
  toggle() { if (this.isOpen) this.close(); else { this.root.hidden = false; this.trigger.setAttribute('aria-expanded', 'true'); this.pad.focus({ preventScroll: true }) } }
  close() { this.activePointer = null; this.root.hidden = true; this.trigger.setAttribute('aria-expanded', 'false'); if (this.root.contains(document.activeElement)) this.trigger.focus({ preventScroll: true }) }
  private emit() { this.sync(); this.change(hsvToHex(this.hsv)) }
  private sync() {
    const hex = hsvToHex(this.hsv), [h, s, v] = this.hsv
    this.pad.style.setProperty('--dp-hue-color', hsvToHex([h, 1, 1]))
    const point = this.root.querySelector<HTMLElement>('.dp-color-point')!
    point.style.left = `${s * 100}%`; point.style.top = `${(1 - v) * 100}%`
    this.pad.setAttribute('aria-valuenow', String(Math.round(s * 100))); this.pad.setAttribute('aria-valuetext', `${Math.round(s * 100)}% saturation, ${Math.round(v * 100)}% brightness`)
    this.hue.value = String(h)
    if (document.activeElement !== this.hex) this.hex.value = hex
    this.hex.setAttribute('aria-invalid', 'false'); this.root.querySelector<HTMLElement>('.dp-color-error')!.hidden = true
    this.root.querySelector<HTMLElement>('.dp-color-preview')!.style.background = hex
    this.trigger.querySelector<HTMLElement>('.dp-current-color')!.style.background = hex
    this.syncPaletteSelection()
  }
  destroy() { this.abort.abort(); this.root.replaceChildren() }
}
