/** Recognize a short, stationary pair of contacts; navigation and palms never undo. */
export class TwoFingerTap {
  private contacts = new Map<number, { x: number; y: number }>()
  private started = 0
  private paired = false
  private valid = false
  private contactCount = 0
  down(id: number, x: number, y: number, time: number) {
    if (!this.contacts.size) { this.started = time; this.paired = false; this.valid = true; this.contactCount = 0 }
    this.contactCount++
    this.contacts.set(id, { x, y })
    if (this.contacts.size === 2) { this.paired = true; if (time - this.started > 150) this.valid = false }
    if (this.contactCount > 2) this.valid = false
  }
  move(id: number, x: number, y: number) {
    const start = this.contacts.get(id)
    if (start && Math.hypot(x - start.x, y - start.y) > 8) this.valid = false
  }
  up(id: number, x: number, y: number, time: number): boolean {
    if (!this.contacts.has(id)) return false
    this.move(id, x, y); this.contacts.delete(id)
    if (this.contacts.size) return false
    const undo = this.valid && this.paired && time - this.started <= 300
    this.reset(); return undo
  }
  cancel(id: number) { if (this.contacts.has(id)) { this.valid = false; this.contacts.delete(id) } }
  reset() { this.contacts.clear(); this.valid = false; this.paired = false }
}
