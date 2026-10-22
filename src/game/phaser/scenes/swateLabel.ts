import { SWATE_LABEL } from '../art/swate'

// The ARCitISA label on SWATE (deprecated) comes off after a few hits. Nothing else changes: the
// hits do no damage and the refine screen stays as it is. Pure, so the counting is tested alone.

// Hits it takes for the label to fall.
export const LABEL_HITS = 4
// A hit within this long of the last counted one is the same swing and does not count.
export const LABEL_HIT_COOLDOWN_MS = 150
// The hit zone is the label plus this much on every side, so a swing at that height finds it.
export const LABEL_HIT_PAD = 10

export type LabelHit = 'ignored' | 'peeled' | 'fell'

export interface LabelState {
  readonly hits: number
  readonly fallen: boolean
  // Counts a hit at `nowMs`.
  hit(nowMs: number): LabelHit
}

export function createLabelState(needed = LABEL_HITS, cooldownMs = LABEL_HIT_COOLDOWN_MS): LabelState {
  let hits = 0
  let last = -Infinity
  return {
    get hits() {
      return hits
    },
    get fallen() {
      return hits >= needed
    },
    hit(nowMs) {
      if (hits >= needed || nowMs - last < cooldownMs) return 'ignored'
      last = nowMs
      hits++
      return hits >= needed ? 'fell' : 'peeled'
    },
  }
}

interface Registry<T> {
  register(combatant: T): void
  unregister(combatant: T): void
}

// Takes the label out of the combat world while a fight runs, so a hostile fighter's hits and the
// mage's shots at him pass through it, and puts it back afterwards if it is still on.
export function labelFight<T>(combat: Registry<T>, bystander: T, state: Pick<LabelState, 'fallen'>, on: boolean): void {
  if (on) combat.unregister(bystander)
  else if (!state.fallen) combat.register(bystander)
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// Fills `out` with the hit zone of the label of a SWATE standing at (x, floorY). It stays above the
// floor line.
export function labelZone<T extends Box>(x: number, floorY: number, out: T): T {
  const left = x + SWATE_LABEL.x - LABEL_HIT_PAD
  const top = floorY + SWATE_LABEL.y - LABEL_HIT_PAD
  out.x = left
  out.y = top
  out.width = SWATE_LABEL.w + 2 * LABEL_HIT_PAD
  out.height = Math.min(floorY, top + SWATE_LABEL.h + 2 * LABEL_HIT_PAD) - top
  return out
}
