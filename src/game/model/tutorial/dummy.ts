// The numbers behind the training dummies. Pure, so the scene only draws them.

// Hits closer together than this keep a combo going.
export const COMBO_GAP_MS = 1200
// The damage per second is the sum over this window, shown a few times a second.
export const DPS_WINDOW_MS = 3000
export const READOUT_INTERVAL_MS = 200
const MAX_TRACKED_HITS = 96

export interface Readout {
  hit(damage: number, nowMs: number): void
  // Re-reads the window at most every READOUT_INTERVAL_MS. True when the numbers shown changed.
  update(nowMs: number): boolean
  // Hits in the current combo, 0 once it ran out.
  combo(): number
  // Damage per second over the window, whole numbers.
  dps(): number
  reset(): void
}

// Ring buffers of fixed size, so a hit and an update allocate nothing.
export function createReadout(): Readout {
  const times = new Float64Array(MAX_TRACKED_HITS)
  const damages = new Float64Array(MAX_TRACKED_HITS)
  let head = 0
  let count = 0
  let comboCount = 0
  let lastHitAt = -Infinity
  let sampledAt = -Infinity
  let shownCombo = 0
  let shownDps = 0

  const windowDamage = (nowMs: number) => {
    let sum = 0
    for (let i = 0; i < count; i++) {
      const slot = (head - 1 - i + MAX_TRACKED_HITS) % MAX_TRACKED_HITS
      if (nowMs - times[slot] > DPS_WINDOW_MS) break
      sum += damages[slot]
    }
    return sum
  }

  return {
    hit(damage, nowMs) {
      comboCount = nowMs - lastHitAt <= COMBO_GAP_MS ? comboCount + 1 : 1
      lastHitAt = nowMs
      times[head] = nowMs
      damages[head] = damage
      head = (head + 1) % MAX_TRACKED_HITS
      count = Math.min(MAX_TRACKED_HITS, count + 1)
      // The next update shows it at once.
      sampledAt = -Infinity
    },
    update(nowMs) {
      if (nowMs - sampledAt < READOUT_INTERVAL_MS) return false
      sampledAt = nowMs
      const combo = nowMs - lastHitAt <= COMBO_GAP_MS ? comboCount : 0
      const dps = Math.round(windowDamage(nowMs) / (DPS_WINDOW_MS / 1000))
      if (combo === shownCombo && dps === shownDps) return false
      shownCombo = combo
      shownDps = dps
      return true
    },
    combo: () => shownCombo,
    dps: () => shownDps,
    reset() {
      head = 0
      count = 0
      comboCount = 0
      lastHitAt = -Infinity
      sampledAt = -Infinity
      shownCombo = 0
      shownDps = 0
    },
  }
}

const SPRING_STIFFNESS = 260
const SPRING_DAMPING = 14
const WOBBLE_MAX = 0.6
const SETTLED_ANGLE = 0.002
const SETTLED_SPEED = 0.02

export interface Wobble {
  // Pushes the dummy: the sign sets the side, the size follows the damage.
  impulse(direction: number, damage: number): void
  step(dtMs: number): void
  // Radians around the feet.
  angle(): number
  settled(): boolean
}

// A damped spring on the lean angle.
export function createWobble(): Wobble {
  let angle = 0
  let speed = 0
  return {
    impulse(direction, damage) {
      speed += Math.sign(direction) * Math.min(WOBBLE_MAX, damage / 60) * 14
    },
    step(dtMs) {
      // Small sub-steps keep the spring stable at any frame time.
      let left = Math.min(dtMs, 50) / 1000
      while (left > 0) {
        const dt = Math.min(left, 1 / 120)
        speed += (-SPRING_STIFFNESS * angle - SPRING_DAMPING * speed) * dt
        angle += speed * dt
        left -= dt
      }
      if (Math.abs(angle) < SETTLED_ANGLE && Math.abs(speed) < SETTLED_SPEED) {
        angle = 0
        speed = 0
      }
    },
    angle: () => angle,
    settled: () => angle === 0 && speed === 0,
  }
}

export type SwingPhase = 'idle' | 'telegraph' | 'active' | 'recover'

export const SWING_TELEGRAPH_MS = 750
// Long enough that a dash anywhere in the window (the dash i-frames last 120 ms) goes through the swing.
export const SWING_ACTIVE_MS = 420
export const SWING_CYCLE_MS = 2600

export interface SwingCycle {
  // Starts a swing now, or stops them after the one that runs.
  enable(on: boolean): void
  // Advances the clock and returns the phase.
  step(dtMs: number): SwingPhase
  phase(): SwingPhase
  // 0 to 1 through the telegraph, for the lean.
  telegraphProgress(): number
  // True once, on the step the active phase begins.
  startedActive(): boolean
  // Time into the cycle, 0 while idle.
  clockMs(): number
}

// The angry dummy's rhythm: a telegraph, a short active sweep, then recovery until the next one.
export function createSwingCycle(): SwingCycle {
  let enabled = false
  let clock = 0
  let running = false
  let current: SwingPhase = 'idle'
  let activeJustStarted = false

  const phaseAt = (t: number): SwingPhase =>
    t < SWING_TELEGRAPH_MS ? 'telegraph' : t < SWING_TELEGRAPH_MS + SWING_ACTIVE_MS ? 'active' : 'recover'

  return {
    enable(on) {
      enabled = on
    },
    step(dtMs) {
      activeJustStarted = false
      if (!running) {
        if (!enabled) return current
        running = true
        clock = 0
      } else {
        clock += dtMs
        if (clock >= SWING_CYCLE_MS) {
          if (enabled) clock -= SWING_CYCLE_MS
          else {
            running = false
            current = 'idle'
            return current
          }
        }
      }
      const next = phaseAt(clock)
      activeJustStarted = next === 'active' && current !== 'active'
      current = next
      return current
    },
    phase: () => current,
    telegraphProgress: () => (current === 'telegraph' ? clock / SWING_TELEGRAPH_MS : current === 'idle' ? 0 : 1),
    startedActive: () => activeJustStarted,
    clockMs: () => (current === 'idle' ? 0 : clock),
  }
}

// A dash this long before the window, or after it, counts as a miss worth a word.
export const DODGE_HINT_MS = 600

export type DodgeVerdict = 'dodged' | 'early' | 'late' | 'range'

export interface DodgeJudge {
  // Once per fixed step. `iframes` is whether the dash makes the player untouchable now, `overlaps`
  // whether the player is inside the swing box and `near` whether the player is close enough for a
  // dash to reach it, so dashes made far away judge nothing. Returns a verdict on the step it is known, else null.
  step(phase: SwingPhase, clockMs: number, iframes: boolean, overlaps: boolean, near: boolean): DodgeVerdict | null
}

// Tells the dodge from the near misses. A dash with i-frames while the swing is active and the player
// inside its box is the dodge. A dash that ended before the window is early, one made after it is
// late, and one inside the window that never met the box is out of range.
export function createDodgeJudge(): DodgeJudge {
  let prevPhase: SwingPhase = 'idle'
  let prevIframes = false
  let early = false
  let inWindow = false
  let dodged = false
  return {
    step(phase, clockMs, iframes, overlaps, near) {
      const edge = iframes && !prevIframes
      let verdict: DodgeVerdict | null = null
      if (phase === 'telegraph' && prevPhase !== 'telegraph') {
        early = false
        inWindow = false
        dodged = false
      }
      if (edge && near) {
        if (phase === 'telegraph' && SWING_TELEGRAPH_MS - clockMs <= DODGE_HINT_MS) early = true
        else if (phase === 'active') inWindow = true
        else if (phase === 'recover' && !inWindow && !dodged && clockMs - SWING_TELEGRAPH_MS - SWING_ACTIVE_MS <= DODGE_HINT_MS) verdict = 'late'
      }
      if (phase === 'active') {
        if (prevPhase !== 'active') {
          // The i-frames of an early dash ran out before the window opened.
          if (early && !iframes) verdict = 'early'
          else if (iframes && near) inWindow = true
          early = false
        }
        if (!dodged && iframes && overlaps) {
          dodged = true
          verdict = 'dodged'
        }
      } else if (prevPhase === 'active' && phase === 'recover') {
        if (inWindow && !dodged) verdict = 'range'
      }
      prevPhase = phase
      prevIframes = iframes
      return verdict
    },
  }
}
