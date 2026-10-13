import { BackendBridge } from './bridge'
import { CATALOG_PAGE_SIZE, GALLERY_CARD_HEIGHT, GALLERY_ROW_HEIGHT, galleryWindow, type CatalogPage, type ThumbnailPreview } from './catalog'
import { icon } from './icons'
import type { DrawingSummary } from './model'

export class LruCache<K, V> {
  private values = new Map<K, V>()
  constructor(private capacity: number) {}
  get size() { return this.values.size }
  get(key: K) {
    const value = this.values.get(key)
    if (value !== undefined) { this.values.delete(key); this.values.set(key, value) }
    return value
  }
  set(key: K, value: V) {
    this.values.delete(key); this.values.set(key, value)
    while (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!)
  }
  clear() { this.values.clear() }
  delete(key: K) { this.values.delete(key) }
}
interface Card { node: HTMLElement; entry?: DrawingSummary; image?: HTMLImageElement; placeholder?: HTMLElement; retry?: HTMLButtonElement }
interface GalleryActions {
  open(id: string, opener: HTMLElement): Promise<void>
  remove(id: string): Promise<void>
  error(error: Error): void
}
const previewKey = (entry: DrawingSummary) => `${entry.id}/${entry.previewVersion}`

/** Only viewport rows (plus one row each side) exist in the DOM. */
export class SketchbookGallery {
  private abort = new AbortController()
  private observer: ResizeObserver
  private scroll: HTMLElement
  private spacer: HTMLElement
  private window: HTMLElement
  private status: HTMLElement
  private retry: HTMLButtonElement
  private pages = new LruCache<number, DrawingSummary[]>(8)
  private previews = new LruCache<string, string>(64)
  private failures = new LruCache<string, boolean>(64)
  private failedPages = new LruCache<number, boolean>(8)
  private cards = new Map<number, Card>()
  private thumbnailRequests = new Set<string>()
  private metadataBusy = false
  private total = 0
  private latestId: string | undefined
  private revision = ''
  private generation = 0
  private frame = 0
  private active = true
  private destroyed = false
  private focusIndex = 0
  private focusPending = false
  private refreshTask: Promise<void> | null = null
  private refreshAgain = false
  constructor(private root: HTMLElement, private bridge: BackendBridge, private actions: GalleryActions) {
    root.innerHTML = `<div class="dp-gallery-heading"><span class="dp-gallery-status" role="status">Loading your sketchbook…</span><button type="button" class="dp-gallery-retry" hidden>Retry</button></div><div class="dp-gallery-scroll" role="list" tabindex="0" aria-label="Sketchbook pages. Use arrow keys to browse pages."><div class="dp-gallery-spacer"><div class="dp-gallery-window"></div></div></div>`
    this.scroll = root.querySelector('.dp-gallery-scroll')!
    this.spacer = root.querySelector('.dp-gallery-spacer')!
    this.window = root.querySelector('.dp-gallery-window')!
    this.status = root.querySelector('.dp-gallery-status')!
    this.retry = root.querySelector('.dp-gallery-retry')!
    this.scroll.addEventListener('scroll', () => this.schedule(), { passive: true, signal: this.abort.signal })
    this.scroll.addEventListener('keydown', this.keydown, { signal: this.abort.signal })
    this.retry.addEventListener('click', () => { void this.refresh() }, { signal: this.abort.signal })
    this.observer = new ResizeObserver(() => this.schedule()); this.observer.observe(this.scroll)
  }
  setActive(active: boolean) { this.active = active; if (active) this.schedule() }
  async latest() { await this.refreshTask; return this.latestId }
  refresh(): Promise<void> {
    if (this.destroyed) return Promise.resolve()
    if (this.refreshTask) { this.refreshAgain = true; return this.refreshTask }
    this.refreshTask = (async () => {
      do { this.refreshAgain = false; await this.firstPage() } while (this.refreshAgain && !this.destroyed)
    })().finally(() => { this.refreshTask = null; this.schedule() })
    return this.refreshTask
  }
  private async firstPage() {
    const generation = ++this.generation
    this.status.textContent = 'Loading your sketchbook…'; this.retry.hidden = true
    try {
      const page = await this.bridge.call<CatalogPage>('list', { offset: 0, limit: CATALOG_PAGE_SIZE })
      if (this.destroyed || generation !== this.generation) return
      if (this.scroll.contains(document.activeElement)) this.scroll.focus({ preventScroll: true })
      this.pages.clear(); this.pages.set(0, page.entries); this.failedPages.clear()
      this.cards.clear(); this.window.replaceChildren()
      this.total = page.total; this.revision = page.revision
      this.latestId = page.entries[0]?.id
      this.focusIndex = Math.min(this.focusIndex, Math.max(0, this.total - 1))
      this.status.textContent = `${this.total.toLocaleString()} ${this.total === 1 ? 'page' : 'pages'}`
      this.scroll.setAttribute('aria-busy', 'false')
      this.render()
    } catch (error) { if (!this.destroyed && generation === this.generation) this.report(error) }
  }
  private report(error: unknown) {
    this.status.textContent = error instanceof Error ? error.message : String(error)
    this.retry.hidden = false
  }
  private schedule() {
    if (this.frame || this.destroyed) return
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render() })
  }
  private entry(index: number) { return this.pages.get(Math.floor(index / CATALOG_PAGE_SIZE) * CATALOG_PAGE_SIZE)?.[index % CATALOG_PAGE_SIZE] }
  private render() {
    if (this.destroyed || !this.active || !this.scroll.clientHeight || !this.scroll.clientWidth) return
    const layout = galleryWindow(this.scroll.clientWidth, this.scroll.clientHeight, this.scroll.scrollTop, this.total)
    this.spacer.style.height = `${layout.height}px`
    // A deletion/resize can shrink the scroll range; calculate again after clamping it.
    const maxScroll = Math.max(0, layout.height - this.scroll.clientHeight)
    if (this.scroll.scrollTop > maxScroll) { this.scroll.scrollTop = maxScroll; this.schedule(); return }
    this.window.style.top = `${layout.top}px`
    this.window.style.gridTemplateColumns = `repeat(${layout.columns},minmax(0,1fr))`
    if (!this.total) {
      this.window.innerHTML = '<div class="dp-empty">A blank page is a good place to start.</div>'
      this.spacer.style.height = '100px'; return
    }
    for (const [index, card] of this.cards) if (index < layout.start || index >= layout.end) {
      if (card.node.contains(document.activeElement)) { this.focusIndex = layout.start; this.scroll.focus({ preventScroll: true }) }
      card.node.remove(); this.cards.delete(index)
    }
    const wantedPages = new Set<number>()
    for (let index = layout.start; index < layout.end; index++) {
      const entry = this.entry(index)
      let card = this.cards.get(index)
      if (!card || card.entry !== entry) {
        card?.node.remove()
        card = entry ? this.makeCard(entry, index) : this.makePlaceholder(index)
        this.cards.set(index, card)
      }
      const position = this.window.children[index - layout.start] ?? null
      if (position !== card.node) this.window.insertBefore(card.node, position)
      for (const button of card.node.querySelectorAll<HTMLButtonElement>('button')) button.tabIndex = index === this.focusIndex ? 0 : -1
      if (entry) this.paintPreview(card)
      else wantedPages.add(Math.floor(index / CATALOG_PAGE_SIZE) * CATALOG_PAGE_SIZE)
    }
    this.scroll.setAttribute('aria-busy', String(wantedPages.size > 0))
    if (this.focusPending) {
      const target = this.cards.get(this.focusIndex)?.node.querySelector<HTMLButtonElement>('.dp-open-card')
      if (target) { target.focus({ preventScroll: true }); this.focusPending = false }
    }
    if (!this.metadataBusy && !this.refreshTask) {
      const offset = [...wantedPages].find(offset => !this.failedPages.get(offset))
      if (offset !== undefined) void this.fetchPage(offset)
    }
    this.fetchPreviews()
  }
  private async fetchPage(offset: number) {
    const generation = this.generation
    this.metadataBusy = true
    try {
      const page = await this.bridge.call<CatalogPage>('list', { offset, limit: CATALOG_PAGE_SIZE, revision: this.revision })
      if (this.destroyed || generation !== this.generation) return
      if (page.reset) { void this.refresh(); return }
      this.pages.set(offset, page.entries)
    } catch (error) {
      if (!this.destroyed && generation === this.generation) { this.failedPages.set(offset, true); this.report(error) }
    } finally { this.metadataBusy = false; this.schedule() }
  }
  private makePlaceholder(index: number): Card {
    const node = document.createElement('div'); node.className = 'dp-card dp-card-placeholder'; node.textContent = 'Loading page…'
    node.setAttribute('role', 'listitem'); node.setAttribute('aria-posinset', String(index + 1)); node.setAttribute('aria-setsize', String(this.total))
    return { node }
  }
  private makeCard(entry: DrawingSummary, index: number): Card {
    const node = document.createElement('article'); node.className = 'dp-card'; node.dataset.id = entry.id; node.dataset.index = String(index)
    node.setAttribute('role', 'listitem'); node.setAttribute('aria-posinset', String(index + 1)); node.setAttribute('aria-setsize', String(this.total))
    const button = document.createElement('button'); button.type = 'button'; button.className = 'dp-open-card'; button.setAttribute('aria-label', `Open ${entry.title || 'Untitled sketch'}`)
    const preview = document.createElement('div'); preview.className = 'dp-card-preview'
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.hidden = true
    const placeholder = document.createElement('span'); placeholder.className = 'dp-preview-placeholder'; placeholder.textContent = 'Loading preview…'
    preview.append(image, placeholder)
    const title = document.createElement('span'); title.className = 'dp-card-title'; title.textContent = entry.title || 'Untitled sketch'
    const date = document.createElement('span'); date.className = 'dp-card-date'; date.textContent = `${entry.width} × ${entry.height} · ${new Date(entry.updatedAt).toLocaleDateString()}`
    button.append(preview, title, date)
    button.addEventListener('focus', () => { this.focusIndex = index })
    button.addEventListener('click', () => { button.disabled = true; void this.actions.open(entry.id, button).catch(this.actions.error).finally(() => { button.disabled = false }) })
    const del = document.createElement('button'); del.type = 'button'; del.className = 'dp-delete-card'
    const disarm = () => { armed = false; del.innerHTML = icon('trash'); del.style.width = ''; del.setAttribute('aria-label', `Delete ${entry.title}`) }
    let armed = false; disarm(); del.title = `Delete ${entry.title}`
    del.addEventListener('focus', () => { this.focusIndex = index })
    del.addEventListener('blur', disarm)
    del.addEventListener('click', () => {
      if (!armed) { armed = true; del.textContent = 'Delete?'; del.style.width = '65px'; del.setAttribute('aria-label', `Confirm delete ${entry.title}`); return }
      del.disabled = true
      void this.actions.remove(entry.id).then(() => this.refresh()).catch(this.actions.error).finally(() => { del.disabled = false })
    })
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'dp-retry-preview'; retry.textContent = 'Retry preview'; retry.hidden = true
    retry.setAttribute('aria-label', `Retry preview for ${entry.title}`)
    retry.addEventListener('click', () => { this.failures.set(previewKey(entry), false); retry.hidden = true; this.schedule() })
    image.addEventListener('error', () => { if (this.destroyed || !node.isConnected) return; this.previews.delete(previewKey(entry)); image.removeAttribute('src'); this.failures.set(previewKey(entry), true); this.schedule() })
    node.append(button, del, retry)
    return { node, entry, image, placeholder, retry }
  }
  private paintPreview(card: Card) {
    const key = previewKey(card.entry!), failed = this.failures.get(key), preview = this.previews.get(key) ?? card.image!.getAttribute('src')
    card.retry!.hidden = !failed
    card.placeholder!.hidden = !!preview && !failed
    card.placeholder!.textContent = failed ? 'Preview unavailable' : 'Loading preview…'
    card.image!.hidden = !preview || !!failed
    if (preview && !failed && card.image!.getAttribute('src') !== preview) card.image!.src = preview
  }
  private fetchPreviews() {
    if (!this.active || this.destroyed) return
    for (const card of this.cards.values()) {
      if (this.thumbnailRequests.size >= 4) break
      if (!card.entry) continue
      const entry = card.entry, key = previewKey(entry), requestKey = `${this.generation}/${key}`
      if (card.image?.hasAttribute('src') || this.previews.get(key) || this.failures.get(key) || this.thumbnailRequests.has(requestKey)) continue
      this.thumbnailRequests.add(requestKey)
      const generation = this.generation
      void this.bridge.call<ThumbnailPreview>('thumbnail', { id: entry.id }).then(preview => {
        if (this.destroyed || generation !== this.generation) return
        if (preview.previewVersion !== entry.previewVersion) {
          // Refresh once for a concurrent save. A partially failed save may leave an
          // old index; mark this version failed so it cannot cause a refresh loop.
          this.failures.set(key, true); void this.refresh(); return
        }
        this.previews.set(key, preview.thumbnail)
      }).catch(() => { if (!this.destroyed && generation === this.generation) this.failures.set(key, true) })
        .finally(() => { this.thumbnailRequests.delete(requestKey); this.schedule() })
    }
  }
  private keydown = (event: KeyboardEvent) => {
    if (event.altKey || event.metaKey || event.ctrlKey || !this.total) return
    const layout = galleryWindow(this.scroll.clientWidth, this.scroll.clientHeight, this.scroll.scrollTop, this.total)
    let destination = this.focusIndex
    switch (event.key) {
      case 'ArrowRight': destination++; break
      case 'ArrowLeft': destination--; break
      case 'ArrowDown': destination += layout.columns; break
      case 'ArrowUp': destination -= layout.columns; break
      case 'Home': destination = 0; break
      case 'End': destination = this.total - 1; break
      case 'PageDown': destination += Math.max(1, Math.floor(this.scroll.clientHeight / GALLERY_ROW_HEIGHT)) * layout.columns; break
      case 'PageUp': destination -= Math.max(1, Math.floor(this.scroll.clientHeight / GALLERY_ROW_HEIGHT)) * layout.columns; break
      default: return
    }
    event.preventDefault(); event.stopPropagation()
    this.focusIndex = Math.max(0, Math.min(this.total - 1, destination)); this.focusPending = true
    const top = Math.floor(this.focusIndex / layout.columns) * GALLERY_ROW_HEIGHT
    if (top < this.scroll.scrollTop) this.scroll.scrollTop = top
    else if (top + GALLERY_CARD_HEIGHT > this.scroll.scrollTop + this.scroll.clientHeight) this.scroll.scrollTop = top + GALLERY_CARD_HEIGHT - this.scroll.clientHeight
    this.schedule()
  }
  destroy() {
    this.destroyed = true; ++this.generation; this.abort.abort(); this.observer.disconnect(); cancelAnimationFrame(this.frame)
    this.pages.clear(); this.previews.clear(); this.failures.clear(); this.cards.clear(); this.root.replaceChildren()
  }
}
