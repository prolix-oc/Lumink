import type { SpindleFrontendContext, SpindleTextInputHandle } from 'lumiverse-spindle-types'
import { BackendBridge } from './bridge'
import { ColorPicker } from './color-picker'
import { DrawingInput, type BrushSettings, type PencilReading, type Camera } from './input'
import { icon } from './icons'
import { createDrawing, DrawingHistory, filename, MAX_LAYERS, validateDrawing, type Drawing, type Layer, type Paper, type SavedDrawing, type Stroke, type Tool } from './model'
import { DrawingRenderer } from './renderer'
import { chooseCanvasSize } from './new-page'
import { DraftSaver, SAVE_DEBOUNCE_MS } from './saver'
import { PaletteStore } from './palette-store'
import { saveToDevice, shareDrawing } from './sharing'
import { SketchbookGallery } from './gallery'
import { FloatingPanel } from './floating-panel'
import { LassoSelection } from './selection'

const colors = ['#23202b', '#7565bb', '#317e91', '#d8687b', '#e7b65b', '#4b986b', '#ffffff']
const button = (action: string, name: string, label: string, classes = '', title = label) => `<button type="button" data-action="${action}" class="${classes}" title="${title}" aria-label="${label}">${icon(name)}<span>${label}</span></button>`
export class DrawingPadApp {
  readonly history: DrawingHistory
  private renderer: DrawingRenderer
  private input: DrawingInput
  private abort = new AbortController()
  private saver: DraftSaver
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private dirty = false
  private destroyed = false
  private busy = false
  private exportToken = 0
  private png: Blob | null = null
  private pngDirty = false
  private titleField: SpindleTextInputHandle
  private captionField: SpindleTextInputHandle
  private colorPicker: ColorPicker
  private colorPanel: FloatingPanel
  private layerPanel: FloatingPanel
  private selection: LassoSelection
  private toastTimer: ReturnType<typeof setTimeout> | undefined
  private components: { destroy(): void }[] = []
  private libraryChanged: () => void
  private gallery: SketchbookGallery
  private settings: BrushSettings = { tool: 'ink', color: colors[0]!, size: 8, opacity: 1, smoothing: 0.25, pressure: true, penOnly: false, predictions: true }
  private paintSettings = { size: 8, opacity: 1 }
  private blendSettings = { size: 48, opacity: 0.6 }
  constructor(private root: HTMLElement, private ctx: SpindleFrontendContext, private bridge: BackendBridge, private palette: PaletteStore, drawing: Drawing, libraryChanged: () => void, private close: () => void) {
    this.history = new DrawingHistory(validateDrawing(drawing))
    this.libraryChanged = libraryChanged
    root.innerHTML = `<section class="dp-app" aria-label="DrawingPad workspace">
      <header class="dp-topbar">
        <div class="dp-title-slot"><div class="dp-title-field"></div><span class="dp-page-size"></span></div><span class="dp-save-state" role="status" data-state="saved">Ready to draw</span>
        ${button('library', 'book', 'Sketchbook', 'dp-book-label')}${button('new', 'plus', 'New')}${button('save-png', 'download', 'Save PNG')}
      </header>
      <button type="button" data-action="close" class="dp-close" aria-label="Close DrawingPad" title="Close DrawingPad (Esc)">${icon('close')}<span>Close</span></button>
      <div class="dp-workspace-controls" hidden>${button('fullscreen', 'restore', 'Restore controls')}</div>
      <div class="dp-main">
        <nav class="dp-tools" aria-label="Drawing tools">
          ${(['ink', 'pencil', 'marker', 'blend', 'eraser', 'lasso', 'hand'] as const).map(tool => `<button type="button" data-tool="${tool}" aria-label="${tool === 'hand' ? 'Pan' : tool}" title="${tool === 'hand' ? 'Pan (H)' : tool === 'blend' ? 'Blend (S)' : tool === 'lasso' ? 'Lasso selection (L)' : `${tool[0]!.toUpperCase()}${tool.slice(1)}`}" aria-pressed="false">${icon(tool)}</button>`).join('')}
          <span class="dp-tool-divider"></span>
          <button type="button" data-action="undo" title="Undo (⌘/Ctrl Z)" aria-label="Undo">${icon('undo')}</button>
          <button type="button" data-action="redo" title="Redo (⌘/Ctrl Shift Z)" aria-label="Redo">${icon('redo')}</button>
          <button type="button" data-action="layers" title="Layers" aria-label="Toggle layers" aria-expanded="false">${icon('layers')}</button>
          <button type="button" data-action="color" class="dp-floating-color-trigger" title="Colors" aria-label="Toggle floating colors" aria-expanded="false"><span class="dp-current-color"></span></button>
        </nav>
        <div class="dp-viewport" tabindex="0" aria-label="Drawing surface. Draw with a pen, finger, or mouse. Two-finger tap undoes. Two fingers drag to pan, zoom, and rotate.">
          <div class="dp-sheet"><canvas aria-label="Your drawing"></canvas><svg class="dp-selection" aria-hidden="true" hidden><path class="dp-selection-base"/><path class="dp-selection-ants"/></svg></div><div class="dp-cursor" hidden></div>
          <div class="dp-selection-toolbar" hidden><span>Freehand · Move</span><button type="button" data-action="deselect">Deselect</button><button type="button" data-action="selection-done">Done</button></div>
          <div class="dp-zoom" aria-label="Canvas view"><button type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button><span class="dp-zoom-value">100%</span><button type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button><button type="button" data-action="reset-rotation" class="dp-rotation-value" aria-label="Reset canvas rotation" title="Reset rotation; keep zoom">0°</button><button type="button" data-action="fit" aria-label="Fit page" title="Fit the page in view">${icon('fit')}</button><span class="dp-zoom-divider"></span><button type="button" data-action="fullscreen" aria-label="Fullscreen canvas" aria-pressed="false" title="Fullscreen canvas">${icon('fullscreen')}</button></div>
        </div>
      </div>
        <aside class="dp-layers dp-floating-panel" aria-label="Layers">
          <div class="dp-layer-heading dp-panel-heading" tabindex="0" aria-label="Move layers panel" title="Drag to move. Arrow keys reposition the panel."><strong>Layers</strong><button type="button" data-action="add-layer" class="dp-icon-button" aria-label="Add layer">${icon('plus')}</button><button type="button" data-action="close-layers" class="dp-icon-button" aria-label="Close layers">${icon('close')}</button></div>
          <div class="dp-layer-list"></div>
          <div class="dp-layer-options"><label>Layer opacity <input type="range" data-setting="layer-opacity" min="0" max="100" value="100" aria-label="Layer opacity"></label>
            <div class="dp-layer-actions"><button type="button" data-action="raise-layer" title="Move layer up">↑</button><button type="button" data-action="lower-layer" title="Move layer down">↓</button><button type="button" data-action="delete-layer" class="dp-icon-button" aria-label="Delete layer">${icon('trash')}</button></div>
            <button type="button" data-action="clear-layer">Clear layer</button><small>Erase and blend affect only the active layer.</small>
          </div>
        </aside>
      <section class="dp-color-picker dp-floating-panel" aria-label="Color picker" hidden></section>
      <div class="dp-properties">
        <div class="dp-colors" aria-label="Colors"><button type="button" data-action="color" class="dp-color-trigger" aria-label="Choose color" aria-expanded="false" title="Choose any color"><span class="dp-current-color"></span><span>Color</span></button>${colors.map(color => `<button type="button" class="dp-swatch" data-color="${color}" style="--swatch:${color}" aria-label="Color ${color}" aria-pressed="false"></button>`).join('')}</div>
        <label class="dp-slider">Size <input type="range" data-setting="size" min="1" max="120" value="8" aria-label="Brush size"><output data-value="size">8 px</output></label>
        <label class="dp-slider"><span data-label="opacity">Opacity</span> <input type="range" data-setting="opacity" min="1" max="100" value="100" aria-label="Brush opacity"><output data-value="opacity">100%</output></label>
        <label class="dp-slider">Steady <input type="range" data-setting="smoothing" min="0" max="85" value="25" aria-label="Stroke stabilization"><output data-value="smoothing">25%</output></label>
      </div>
      <div class="dp-preferences"><label class="dp-select">Paper <select data-setting="paper" aria-label="Paper"><option value="plain">White</option><option value="cream">Cream</option><option value="ruled">Ruled</option><option value="grid">Grid</option><option value="transparent">Transparent</option></select></label>
        <div class="dp-toggle" data-checkbox="pressure"></div><div class="dp-toggle" data-checkbox="penOnly"></div>
        <details class="dp-pencil-details"><summary>Pencil details</summary><p class="dp-readings">Use your Pencil to see pressure and tilt.\nExtra samples and predictions are detected automatically.</p></details>
      </div>
      <div class="dp-share-row"><div class="dp-caption-slot"></div>${button('share', 'share', 'Share to chat', 'dp-primary')}</div>
      <div class="dp-notice" role="status">Draw with Pencil, a finger, or a mouse. Two-finger tap to undo; drag two fingers to pan, zoom, and rotate.</div>
      <div class="dp-canvas-toast" role="status" hidden></div>
      <section class="dp-library" aria-label="Sketchbook" hidden><div class="dp-library-heading">${button('back', 'arrow', 'Back')}<h2>Your sketchbook</h2></div><div class="dp-row">${button('export-project', 'download', 'Save editable file')}${button('import-project', 'book', 'Open editable file')}</div><small>Pages autosave to your Lumiverse account. PNGs are flattened; editable files keep the layers.</small><div class="dp-gallery"></div></section>
    </section>`
    this.gallery = new SketchbookGallery(this.query('.dp-gallery'), bridge, {
      open: async id => { const saved = await bridge.call<SavedDrawing>('load', { id }); await this.load(saved.drawing) },
      remove: async id => {
        await bridge.call('delete', { id }); this.libraryChanged()
        if (id === this.history.current.id) { this.dirty = false; this.selection.clear(); this.history.replace(createDrawing()); this.titleField.update({ value: this.history.current.title }); this.renderer.setDrawing(this.history.current); this.input.reset(); this.updateUi(); this.preparePng() }
      },
      error: error => this.notice(error.message, true),
    })
    this.gallery.setActive(false)
    const canvas = this.query<HTMLCanvasElement>('canvas')
    this.renderer = new DrawingRenderer(canvas, drawing)
    this.selection = new LassoSelection(root.querySelector<SVGSVGElement>('.dp-selection')!, this.query('.dp-selection-toolbar'), () => this.history.current,
      polygon => this.renderer.hasSelection(this.history.current.activeLayerId, polygon),
      move => this.renderer.render(undefined, move ? { layerId: this.history.current.activeLayerId, move } : undefined),
      move => { const id = this.history.current.activeLayerId; this.history.commit({ ...this.history.current, layers: this.history.current.layers.map(layer => layer.id === id ? { ...layer, selectionMoves: [...(layer.selectionMoves ?? []), move] } : layer) }); this.changed() },
      message => this.notice(message))
    this.saver = new DraftSaver(bridge, (saved, _summary) => {
      if (saved.id === this.history.current.id && saved === this.history.current) { this.dirty = false; this.saveState('Saved', 'saved') }
      this.libraryChanged()
    }, error => { this.saveState('Not saved · retry in Sketchbook', 'error'); this.notice(error.message, true) })
    this.input = new DrawingInput(this.query('.dp-viewport'), this.query('.dp-sheet'), this.query('.dp-cursor'), () => this.history.current, () => this.settings,
      preview => this.renderer.render(preview), (stroke, layerId) => this.commitStroke(stroke, layerId), reading => this.reading(reading), camera => this.camera(camera), message => this.notice(message, true), { undo: () => this.historyAction(false), selection: this.selection })
    this.titleField = ctx.components.mountTextInput(this.query('.dp-title-field'), { value: drawing.title, ariaLabel: 'Drawing title', onChange: value => {
      const title = value.slice(0, 100)
      if (title === this.history.current.title) return
      this.history.current = { ...this.history.current, title, updatedAt: Date.now() }; this.changed(false)
    } })
    this.captionField = ctx.components.mountTextInput(this.query('.dp-caption-slot'), { value: '', ariaLabel: 'Caption for chat', placeholder: 'Add a caption for chat…' })
    this.components.push(this.titleField, this.captionField)
    this.colorPicker = new ColorPicker(this.query('.dp-color-picker'), [...root.querySelectorAll<HTMLButtonElement>('[data-action="color"]')], hex => { this.settings.color = hex; this.updateUi() }, { save: hex => this.palette.save(hex), remove: hex => this.palette.remove(hex) })
    const app = this.query('.dp-app')
    this.layerPanel = new FloatingPanel(app, this.query('.dp-layers'), this.query('.dp-layer-heading'), () => ({ x: app.clientWidth - 252, y: 76 }))
    this.colorPanel = new FloatingPanel(app, this.query('.dp-color-picker'), this.query('.dp-color-heading'), () => ({ x: app.clientWidth > 650 ? app.clientWidth - 570 : 64, y: 76 }))
    this.colorPicker.setColor(this.settings.color)
    this.components.push({ destroy: this.palette.subscribe((colors, error) => this.colorPicker.setPalette(colors, error)) })
    for (const key of ['pressure', 'penOnly'] as const) this.components.push(ctx.components.mountCheckbox(this.query(`[data-checkbox="${key}"]`), { checked: this.settings[key], label: key === 'pressure' ? 'Pressure' : 'Pen only', onChange: value => { this.settings[key] = value; this.notice(key === 'penOnly' && value ? 'Pencil draws. Two-finger tap undoes; fingers drag to pan, zoom, and rotate.' : 'Draw with Pencil, a finger, or a mouse. Two-finger tap to undo; drag two fingers to pan, zoom, and rotate.') } }))
    const signal = this.abort.signal
    root.addEventListener('click', this.click, { signal })
    root.addEventListener('input', this.controlInput, { signal })
    root.addEventListener('change', this.controlChange, { signal })
    this.query('.dp-viewport').addEventListener('pointerdown', () => this.query('.dp-viewport').focus({ preventScroll: true }), { signal })
    document.addEventListener('keydown', this.keydown, { signal })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.flush().catch(() => undefined) }, { signal })
    this.query('.dp-layers').hidden = root.clientWidth < 900
    this.updateUi(); this.preparePng()
    this.query('.dp-viewport').focus({ preventScroll: true })
  }
  private query<T extends HTMLElement = HTMLElement>(selector: string): T { const el = this.root.querySelector<T>(selector); if (!el) throw new Error(`Missing DrawingPad element: ${selector}`); return el }
  private notice(message: string, error = false) {
    if (this.destroyed) return
    const el = this.query('.dp-notice'); el.textContent = message; el.dataset.error = String(error)
    if (this.query('.dp-app').classList.contains('dp-canvas-fullscreen')) {
      const toast = this.query('.dp-canvas-toast'); toast.textContent = message; toast.hidden = false; toast.dataset.error = String(error)
      clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { toast.hidden = true }, error ? 5000 : 2200)
    }
  }
  private saveState(message: string, state: string) { if (this.destroyed) return; const el = this.query('.dp-save-state'); el.textContent = message; el.dataset.state = state }
  private reading(reading: PencilReading) {
    this.query('.dp-readings').textContent = `${reading.pointer === 'pen' ? 'Pencil / pen' : reading.pointer} · pressure ${Math.round(reading.pressure * 100)}%\nTilt X ${reading.tiltX}° · Y ${reading.tiltY}°\nExtra samples: ${reading.coalesced ? 'available' : 'unavailable'} · latest ${reading.samples}\nPredictions: ${reading.predicted ? 'available' : 'unavailable'}\nPencil brush uses tilt for broader shading.\nPen only keeps finger touches from making marks.`
  }
  private camera(camera: Camera) {
    this.query('.dp-zoom-value').textContent = `${Math.round(camera.scale * 100)}%`
    const angle = (Math.round(camera.rotation * 180 / Math.PI) % 360 + 360) % 360
    const rotation = this.query('.dp-rotation-value')
    rotation.textContent = `${angle}°`; rotation.title = `${angle}° · Reset rotation; keep zoom`
  }
  private updateUi() {
    const d = this.history.current
    this.query('.dp-page-size').textContent = `${d.width} × ${d.height} px`
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-tool]')) el.setAttribute('aria-pressed', String(el.dataset.tool === this.settings.tool))
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-color]')) el.setAttribute('aria-pressed', String(el.dataset.color === this.settings.color))
    this.query<HTMLButtonElement>('[data-action="undo"]').disabled = !this.history.canUndo
    this.query<HTMLButtonElement>('[data-action="redo"]').disabled = !this.history.canRedo
    this.query('[data-action="layers"]').setAttribute('aria-expanded', String(!this.query('.dp-layers').hidden))
    this.query<HTMLButtonElement>('[data-action="add-layer"]').disabled = d.layers.length >= MAX_LAYERS
    this.query<HTMLButtonElement>('[data-action="delete-layer"]').disabled = d.layers.length === 1
    this.query<HTMLButtonElement>('[data-action="save-png"]').disabled = !this.png || this.busy
    this.query<HTMLButtonElement>('[data-action="share"]').disabled = !this.png || this.busy || !this.ctx.getActiveChat().chatId
    this.query<HTMLSelectElement>('[data-setting="paper"]').value = d.paper
    this.query<HTMLInputElement>('[data-setting="layer-opacity"]').value = String(Math.round(d.layers.find(layer => layer.id === d.activeLayerId)!.opacity * 100))
    const list = this.query('.dp-layer-list'); list.replaceChildren()
    for (const layer of [...d.layers].reverse()) {
      const row = document.createElement('div'); row.className = 'dp-layer'; row.dataset.active = String(layer.id === d.activeLayerId)
      const select = document.createElement('button'); select.type = 'button'; select.className = 'dp-layer-select'; select.dataset.layer = layer.id; select.textContent = layer.name; select.setAttribute('aria-pressed', String(layer.id === d.activeLayerId))
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'dp-layer-eye'; eye.dataset.toggleLayer = layer.id; eye.innerHTML = icon(layer.visible ? 'eye' : 'hidden'); eye.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`)
      row.append(select, eye); list.appendChild(row)
    }
  }
  private changed(render = true) {
    if (render) {
      this.renderer.setDrawing(this.history.current)
      this.pngDirty = true; this.png = null; ++this.exportToken
    }
    this.dirty = true; this.saveState('Unsaved changes', 'pending'); this.updateUi()
    clearTimeout(this.saveTimer)
    const saveWhenIdle = () => {
      if (this.input.isDrawing) { this.saveTimer = setTimeout(saveWhenIdle, 300); return }
      void this.flush().catch(() => undefined)
    }
    this.saveTimer = setTimeout(saveWhenIdle, SAVE_DEBOUNCE_MS)
  }
  private preparePng() {
    this.pngDirty = false
    const token = ++this.exportToken
    this.png = null
    this.updateUi()
    void this.renderer.png().then(blob => { if (!this.destroyed && token === this.exportToken) { this.png = blob; this.updateUi() } }).catch(error => this.notice(error.message, true))
  }
  private edit(mutator: (drawing: Drawing) => Drawing) {
    this.input.cancelStroke(); this.selection.clear(); this.history.commit(mutator(this.history.current)); this.changed()
  }
  private editLayer(mutator: (layer: Layer) => Layer) { this.edit(d => ({ ...d, layers: d.layers.map(layer => layer.id === d.activeLayerId ? mutator(layer) : layer) })) }
  private commitStroke(stroke: Stroke, layerId: string) {
    this.history.commit({ ...this.history.current, layers: this.history.current.layers.map(layer => layer.id === layerId ? { ...layer, strokes: [...layer.strokes, stroke] } : layer) }); this.changed()
    if (stroke.tool !== 'eraser' && stroke.tool !== 'blend') this.palette.use(stroke.color)
  }
  async flush() {
    clearTimeout(this.saveTimer); this.saveTimer = undefined
    if (this.pngDirty) this.preparePng()
    let draft: Promise<void>
    if (this.dirty) { this.saveState('Saving…', 'saving'); draft = this.saver.enqueue(this.history.current, this.renderer.thumbnail()) }
    else draft = this.saver.flush()
    await Promise.all([draft, this.palette.flush()])
  }
  async load(drawing: Drawing) {
    await this.flush()
    if (this.destroyed) return
    this.input.reset(); this.selection.clear(); this.history.replace(validateDrawing(drawing)); this.dirty = false
    this.titleField.update({ value: drawing.title }); this.captionField.update({ value: '' })
    this.renderer.setDrawing(drawing); this.input.fit(); this.updateUi(); this.preparePng(); this.saveState('Saved', 'saved')
    this.hideLibrary()
  }
  onChatChanged() { if (!this.destroyed) this.updateUi() }
  markUnsaved() { this.changed(false) }
  private controlInput = (event: Event) => {
    const input = event.target as HTMLInputElement
    const setting = input.dataset.setting
    if (setting === 'size') { this.settings.size = Number(input.value); this.query('[data-value="size"]').textContent = `${input.value} px` }
    if (setting === 'opacity') { this.settings.opacity = Number(input.value) / 100; this.query('[data-value="opacity"]').textContent = `${input.value}%` }
    if (setting === 'smoothing') { this.settings.smoothing = Number(input.value) / 100; this.query('[data-value="smoothing"]').textContent = `${input.value}%` }
  }
  private controlChange = (event: Event) => {
    const input = event.target as HTMLInputElement
    if (input.dataset.setting === 'paper') this.edit(d => ({ ...d, paper: input.value as Paper }))
    if (input.dataset.setting === 'layer-opacity') this.editLayer(layer => ({ ...layer, opacity: Number(input.value) / 100 }))
  }
  private selectTool(tool: Tool) {
    this.input.cancelStroke(); this.selection.clear()
    const wasBlend = this.settings.tool === 'blend', blend = tool === 'blend'
    if (wasBlend !== blend) {
      if (wasBlend) this.blendSettings = { size: this.settings.size, opacity: this.settings.opacity }
      else this.paintSettings = { size: this.settings.size, opacity: this.settings.opacity }
      Object.assign(this.settings, blend ? this.blendSettings : this.paintSettings)
    }
    this.settings.tool = tool
    this.query('[data-label="opacity"]').textContent = blend ? 'Strength' : 'Opacity'
    this.query('[data-setting="opacity"]').setAttribute('aria-label', blend ? 'Blend strength' : 'Brush opacity')
    for (const key of ['size', 'opacity'] as const) {
      const value = key === 'size' ? this.settings.size : Math.round(this.settings.opacity * 100)
      this.query<HTMLInputElement>(`[data-setting="${key}"]`).value = String(value)
      this.query(`[data-value="${key}"]`).textContent = `${value}${key === 'size' ? ' px' : '%'}`
    }
    if (blend) { this.colorPicker.close(); this.notice('Blend existing colors on the active layer. Size sets the area; Strength controls the smudge.') }
    if (tool === 'lasso') this.notice('Draw a loop around artwork on the active layer, then drag inside to move it.')
    this.updateUi()
  }
  private click = (event: MouseEvent) => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!target || !this.root.contains(target) || target.disabled) return
    if (target.dataset.tool) { this.selectTool(target.dataset.tool as Tool); return }
    if (target.dataset.color) { this.settings.color = target.dataset.color; this.colorPicker.setColor(this.settings.color); this.updateUi(); return }
    if (target.dataset.layer) { this.input.cancelStroke(); this.selection.clear(); this.history.current = { ...this.history.current, activeLayerId: target.dataset.layer }; this.changed(false); return }
    if (target.dataset.toggleLayer) { this.edit(d => ({ ...d, layers: d.layers.map(layer => layer.id === target.dataset.toggleLayer ? { ...layer, visible: !layer.visible } : layer) })); return }
    const action = target.dataset.action
    if (this.busy && !['back', 'close', 'fullscreen'].includes(action ?? '')) return
    switch (action) {
      case 'undo': this.historyAction(false); break
      case 'redo': this.historyAction(true); break
      case 'layers': this.toggleLayers(); break
      case 'close-layers': this.toggleLayers(false); break
      case 'deselect': this.input.cancelStroke(); this.selection.clear(); break
      case 'selection-done': this.selectTool('ink'); break
      case 'add-layer': if (this.history.current.layers.length < MAX_LAYERS) { const id = crypto.randomUUID(); this.edit(d => ({ ...d, activeLayerId: id, layers: [...d.layers, { id, name: `Layer ${d.layers.length + 1}`, visible: true, opacity: 1, strokes: [] }] })) }; break
      case 'delete-layer': if (this.history.current.layers.length > 1) this.edit(d => { const layers = d.layers.filter(layer => layer.id !== d.activeLayerId); return { ...d, layers, activeLayerId: layers.at(-1)!.id } }); break
      case 'clear-layer': this.editLayer(layer => ({ ...layer, strokes: [], selectionMoves: undefined })); this.notice('Layer cleared. Undo restores it.'); break
      case 'raise-layer': this.reorder(1); break
      case 'lower-layer': this.reorder(-1); break
      case 'fit': this.input.fit(); break
      case 'reset-rotation': this.input.resetRotation(); break
      case 'fullscreen': this.fullscreen(); break
      case 'close': this.close(); break
      case 'color': this.colorPicker.toggle(target); this.colorPanel.bringToFront(); this.colorPanel.layout(); break
      case 'zoom-in': this.input.zoom(1.25); break
      case 'zoom-out': this.input.zoom(0.8); break
      case 'new': void this.newPage().catch(error => this.notice(error.message, true)); break
      case 'library': void this.showLibrary().catch(error => this.notice(error.message, true)); break
      case 'back': this.hideLibrary(); this.query('.dp-viewport').focus({ preventScroll: true }); break
      case 'save-png': if (this.png) void saveToDevice(this.png, this.history.current.title, this.root).catch(error => this.notice(error.message, true)); break
      case 'share': void this.share(); break
      case 'export-project': this.downloadProject(); break
      case 'import-project': void this.importProject().catch(error => this.notice(error.message, true)); break
    }
  }
  private historyAction(redo: boolean) {
    this.input.cancelStroke(); this.selection.clear()
    if (redo ? !this.history.canRedo : !this.history.canUndo) return
    redo ? this.history.redo() : this.history.undo()
    this.titleField.update({ value: this.history.current.title }); this.changed(); this.notice(redo ? 'Redo' : 'Undo')
  }
  private toggleLayers(open = this.query('.dp-layers').hidden) {
    const panel = this.query('.dp-layers'), focused = panel.contains(document.activeElement)
    panel.hidden = !open; this.layerPanel.layout()
    if (open) this.layerPanel.bringToFront()
    this.query('[data-action="layers"]').setAttribute('aria-expanded', String(open))
    if (!open && focused) this.query('[data-action="layers"]').focus({ preventScroll: true })
  }
  private fullscreen() {
    this.input.cancelStroke()
    const expanded = this.query('.dp-app').classList.toggle('dp-canvas-fullscreen')
    this.layerPanel.layout(); this.colorPanel.layout()
    this.query('.dp-workspace-controls').hidden = !expanded
    const toggle = this.query<HTMLButtonElement>('.dp-zoom [data-action="fullscreen"]')
    toggle.setAttribute('aria-pressed', String(expanded)); toggle.title = expanded ? 'Restore controls' : 'Fullscreen canvas'; toggle.innerHTML = icon(expanded ? 'restore' : 'fullscreen')
    this.query('.dp-viewport').focus({ preventScroll: true })
  }
  private reorder(direction: number) {
    const d = this.history.current, index = d.layers.findIndex(layer => layer.id === d.activeLayerId), destination = index + direction
    if (destination < 0 || destination >= d.layers.length) return
    this.edit(d => { const layers = [...d.layers]; [layers[index], layers[destination]] = [layers[destination]!, layers[index]!]; return { ...d, layers } })
  }
  private keydown = (event: KeyboardEvent) => {
    if (!this.root.contains(document.activeElement)) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      if (this.colorPicker.isOpen) this.colorPicker.close()
      else if (this.selection.hasSelection || (this.settings.tool === 'lasso' && this.input.isDrawing)) { this.input.cancelStroke(); this.selection.clear() }
      else if (!this.query('.dp-library').hidden) { this.hideLibrary(); this.query('.dp-viewport').focus({ preventScroll: true }) }
      else if (this.query('.dp-app').classList.contains('dp-canvas-fullscreen')) this.fullscreen()
      else this.close()
      return
    }
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); this.historyAction(event.shiftKey); return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const tools: Record<string, Tool> = { b: 'ink', p: 'pencil', m: 'marker', s: 'blend', e: 'eraser', h: 'hand', l: 'lasso' }
    const tool = tools[event.key.toLowerCase()]
    if (tool) { event.preventDefault(); this.selectTool(tool) }
  }
  private async newPage() {
    this.input.cancelStroke(); this.colorPicker.close()
    const size = await chooseCanvasSize(this.ctx, this.history.current)
    if (this.destroyed) return
    this.query('.dp-viewport').focus({ preventScroll: true })
    if (!size) return
    await this.load(createDrawing(size.width, size.height))
    this.changed(); this.notice('Fresh canvas. Your previous drawing is in the sketchbook.')
  }
  async showLibrary() {
    this.input.cancelStroke(); this.colorPicker.close(); await this.flush()
    if (this.destroyed) return
    this.query('.dp-library').hidden = false
    this.gallery.setActive(true)
    this.query<HTMLButtonElement>('[data-action="back"]').focus({ preventScroll: true })
    await this.gallery.refresh()
  }
  private hideLibrary() { this.query('.dp-library').hidden = true; this.gallery.setActive(false) }
  private downloadProject() {
    const blob = new Blob([JSON.stringify(this.history.current)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = filename(this.history.current.title, 'drawingpad.json'); this.root.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  private async importProject() {
    const files = await this.ctx.uploads.pickFile({ accept: ['.json', 'application/json'] })
    if (!files[0] || this.destroyed) return
    const drawing = validateDrawing(JSON.parse(new TextDecoder().decode(files[0].bytes)))
    // Import as a fresh page; never overwrite another saved page by its id.
    await this.load({ ...drawing, id: crypto.randomUUID(), updatedAt: Date.now() }); this.changed(); this.notice('Editable drawing opened as a new sketchbook page.')
  }
  private async share() {
    if (!this.png || this.busy) return
    this.busy = true; this.updateUi()
    const drawing = this.history.current, blob = this.png, caption = this.captionField.getValue()
    try { await shareDrawing(this.ctx, this.bridge, blob, drawing.title, caption, this.abort.signal, message => this.notice(message)); this.notice('Drawing shared to chat.'); this.captionField.update({ value: '' }) }
    catch (error) { this.notice(error instanceof Error ? error.message : String(error), true) }
    finally { this.busy = false; if (!this.destroyed) this.updateUi() }
  }
  async destroy() {
    if (this.destroyed) return
    this.input.cancelStroke(); this.abort.abort()
    try { await this.flush() } finally {
      this.destroyed = true; clearTimeout(this.saveTimer); clearTimeout(this.toastTimer); this.input.destroy(); this.renderer.destroy(); this.colorPicker.destroy(); this.layerPanel.destroy(); this.colorPanel.destroy(); this.gallery.destroy()
      for (const component of this.components) component.destroy()
      this.root.replaceChildren()
    }
  }
}

