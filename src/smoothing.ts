import { clamp, type Point } from './model'

const weight = (cutoff: number, seconds: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * seconds))
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount

/** Speed-adaptive low-pass filter, following https://gery.casiez.net/1euro/.
 * Motion is measured in displayed pixels, so zoom and host UI scale do not change
 * the feel. Each confirmed hardware sample advances it; predictions use a clone.
 */
export class PenSmoother {
  private raw: Point | null = null
  private filtered: Point | null = null
  private time = 0
  private velocity: [number, number] = [0, 0]
  constructor(private strength: number, private displayScale = 1) {}
  push(point: Point, timestamp: number): Point {
    if (!this.raw || !this.filtered) {
      this.time = timestamp; this.raw = [...point]; this.filtered = [...point]
      return [...point]
    }
    if (timestamp < this.time) return [...this.filtered]
    // Ignore duplicate hardware samples; a later stationary sample still lets the
    // filter settle toward the held tip and lets its velocity decay.
    if (timestamp === this.time && point.every((value, index) => value === this.raw![index])) return [...this.filtered]
    const seconds = clamp((timestamp - this.time) / 1000 || 1 / 240, 1 / 1000, 0.05)
    const derivativeWeight = weight(8, seconds)
    this.velocity = [
      mix(this.velocity[0], (point[0] - this.raw[0]) * this.displayScale / seconds, derivativeWeight),
      mix(this.velocity[1], (point[1] - this.raw[1]) * this.displayScale / seconds, derivativeWeight),
    ]
    const strength = clamp(this.strength, 0, 1)
    const cutoff = 1.5 + 28 * (1 - strength) ** 3 + 0.08 * (1 - strength * 0.5) * Math.hypot(...this.velocity)
    const positionWeight = strength === 0 ? 1 : weight(cutoff, seconds)
    const pressureWeight = strength === 0 ? 1 : weight(30 - 20 * strength, seconds)
    this.filtered = [
      mix(this.filtered[0], point[0], positionWeight), mix(this.filtered[1], point[1], positionWeight),
      mix(this.filtered[2], point[2], pressureWeight), mix(this.filtered[3] ?? 0, point[3] ?? 0, pressureWeight),
    ]
    this.raw = [...point]; this.time = timestamp
    return [...this.filtered]
  }
  /** Preserve the last contact location on lift without using release pressure/position. */
  finish(): Point | null {
    return this.raw && this.filtered ? [this.raw[0], this.raw[1], this.filtered[2], this.filtered[3] ?? 0] : null
  }
  clone() {
    const copy = new PenSmoother(this.strength, this.displayScale)
    copy.raw = this.raw && [...this.raw]; copy.filtered = this.filtered && [...this.filtered]
    copy.time = this.time; copy.velocity = [...this.velocity]
    return copy
  }
}
