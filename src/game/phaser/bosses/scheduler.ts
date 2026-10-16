import type { Rng } from '../../contracts/rng'

// The shortest time a danger zone is shown. Even at telegraph quality 0 the player gets one flash.
export const MIN_WINDUP_MS = 80
// Pause before the first attack of a fight or a phase.
export const OPENING_DELAY_MS = 1200

export function windupMs(telegraphMs: number): number {
  return Math.max(MIN_WINDUP_MS, telegraphMs)
}

// Idle time after a heavy attack. A well-annotated step gives the player a longer window to punish.
export function punishWindowMs(quality: number): number {
  return 400 + 300 * clamp01(quality)
}

// Pause after a light attack.
export function lightGapMs(quality: number): number {
  return 150 + 50 * clamp01(quality)
}

// A poorly annotated boss recharges its attacks faster. A fully annotated one is unchanged.
export function qualityCooldownScale(quality: number): number {
  return 0.6 + 0.4 * clamp01(quality)
}

// How long the boss may stand ready with every attack on cooldown before a light attack skips its.
export function starveCapMs(quality: number): number {
  return 250 + 350 * clamp01(quality)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface SchedulableAttack {
  id: string
  heavy: boolean
  cooldownMs: number
}

export interface AttackScheduler<A extends SchedulableAttack> {
  // Replaces the attack list (a phase change). Cooldowns restart and nothing is picked for delayMs.
  setAttacks(attacks: readonly A[], quality: number, delayMs?: number): void
  // Advances cooldowns and the idle time. Call once per step.
  tick(dtMs: number): void
  // The next attack, or null while busy, idle or when every candidate is on cooldown. With
  // weightOf the pick is weighted, and an attack of weight 0 is never picked: while only those are
  // ready, next() waits for one that weighs more (unless no attack of the list does).
  next(weightOf?: (attack: A) => number): A | null
  // The attack from next() is over. Its cooldown starts and the idle time begins. If setAttacks
  // replaced the list while it ran (a phase shift), it still sets the idle time and the heavy rule.
  complete(idleMs?: number): void
  // Multiplies the cooldown of every attack that completes from now on (an enraged or tempo boss
  // recharges faster). The idle time after an attack stays as it is.
  setCooldownScale(scale: number): void
  // Keeps the boss from starting an attack for at least this long.
  delay(ms: number): void
  busy(): boolean
}

export function createScheduler<A extends SchedulableAttack>(rng: Rng): AttackScheduler<A> {
  let attacks: readonly A[] = []
  let cooldowns: number[] = []
  let quality = 0
  let idleMs = 0
  let current = -1
  let lastHeavy = false
  let cooldownScale = 1
  // A list without light attacks would never pick again if heavy attacks could not follow each other.
  let hasLight = false
  // Time spent ready with every attack on cooldown, see starveCapMs.
  let starveMs = 0
  // The attack that was running when setAttacks replaced the list.
  let orphan: A | null = null
  const eligible: number[] = []

  function ready(i: number): boolean {
    return cooldowns[i] <= 0 && !(lastHeavy && attacks[i].heavy && hasLight)
  }
  function anyEligible(): boolean {
    for (let i = 0; i < attacks.length; i++) if (ready(i)) return true
    return false
  }
  function gapAfter(attack: A): number {
    return attack.heavy ? punishWindowMs(quality) : lightGapMs(quality)
  }
  function start(i: number): A {
    current = i
    starveMs = 0
    orphan = null
    return attacks[i]
  }

  return {
    setAttacks(next, nextQuality, delayMs = 0) {
      if (current >= 0) orphan = attacks[current]
      attacks = next
      cooldowns = next.map(() => 0)
      quality = clamp01(nextQuality)
      idleMs = delayMs
      starveMs = 0
      current = -1
      lastHeavy = false
      hasLight = next.some((attack) => !attack.heavy)
    },
    tick(dtMs) {
      idleMs = Math.max(0, idleMs - dtMs)
      for (let i = 0; i < cooldowns.length; i++) {
        if (cooldowns[i] > 0) cooldowns[i] = Math.max(0, cooldowns[i] - dtMs)
      }
      if (current < 0 && !orphan && idleMs <= 0 && !anyEligible()) starveMs += dtMs
    },
    next(weightOf) {
      if (current >= 0 || idleMs > 0) return null
      eligible.length = 0
      let total = 0
      for (let i = 0; i < attacks.length; i++) {
        if (!ready(i)) continue
        eligible.push(i)
        if (weightOf) total += weightOf(attacks[i])
      }
      if (eligible.length === 0) {
        if (!hasLight || starveMs < starveCapMs(quality)) return null
        // Starved: the light attack closest to ready goes without waiting for its cooldown.
        let pick = -1
        for (let i = 0; i < attacks.length; i++) {
          if (attacks[i].heavy || (weightOf && weightOf(attacks[i]) <= 0)) continue
          if (pick < 0 || cooldowns[i] < cooldowns[pick]) pick = i
        }
        if (pick < 0) return null
        return start(pick)
      }
      if (weightOf && total > 0) {
        let roll = rng.next() * total
        for (const i of eligible) {
          const weight = weightOf(attacks[i])
          if (weight <= 0) continue
          current = i
          roll -= weight
          if (roll < 0) break
        }
        starveMs = 0
        orphan = null
        return attacks[current]
      }
      if (weightOf) for (const attack of attacks) if (weightOf(attack) > 0) return null
      return start(eligible[rng.int(0, eligible.length - 1)])
    },
    complete(idleOverrideMs) {
      if (current < 0) {
        if (!orphan) return
        lastHeavy = orphan.heavy
        idleMs = Math.max(idleMs, idleOverrideMs ?? gapAfter(orphan))
        orphan = null
        return
      }
      const attack = attacks[current]
      cooldowns[current] = attack.cooldownMs * cooldownScale * qualityCooldownScale(quality)
      lastHeavy = attack.heavy
      idleMs = idleOverrideMs ?? gapAfter(attack)
      current = -1
    },
    setCooldownScale(scale) {
      cooldownScale = scale
    },
    delay(ms) {
      idleMs = Math.max(idleMs, ms)
    },
    busy: () => current >= 0,
  }
}
