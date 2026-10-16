// The short freeze after a hit. A dash or jump press cuts it short, so those buttons answer on the
// step they are pressed instead of after up to 70 ms of frozen time.
export interface HitStop {
  hit(ms: number): void
  // Counts the freeze down. Returns true while the world is still frozen.
  tick(dtMs: number): boolean
  remainingMs(): number
  interrupt(pressed: ReadonlySet<string>): void
}

export function createHitStop(): HitStop {
  let remaining = 0
  return {
    hit(ms) {
      remaining = Math.max(remaining, ms)
    },
    tick(dtMs) {
      if (remaining <= 0) return false
      remaining = Math.max(0, remaining - dtMs)
      return true
    },
    remainingMs: () => remaining,
    interrupt(pressed) {
      if (pressed.has('dash') || pressed.has('jump')) remaining = 0
    },
  }
}
