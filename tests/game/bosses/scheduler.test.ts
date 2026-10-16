import { describe, expect, it } from 'vitest'
import { createRng } from '../../../src/game/contracts/rng'
import {
  createScheduler,
  lightGapMs,
  MIN_WINDUP_MS,
  punishWindowMs,
  qualityCooldownScale,
  starveCapMs,
  windupMs,
  type SchedulableAttack,
} from '../../../src/game/phaser/bosses/scheduler'

const attack = (id: string, heavy: boolean, cooldownMs: number): SchedulableAttack => ({ id, heavy, cooldownMs })

const MIXED = [attack('h1', true, 1500), attack('h2', true, 1500), attack('l1', false, 600), attack('l2', false, 600)]

// Runs attacks that end the moment they start and returns the ids in the order they were picked.
function simulate(attacks: SchedulableAttack[], seed: string, totalMs: number): string[] {
  const scheduler = createScheduler(createRng(seed))
  scheduler.setAttacks(attacks, 0)
  const picked: string[] = []
  for (let t = 0; t < totalMs; t += 10) {
    scheduler.tick(10)
    const next = scheduler.next()
    if (!next) continue
    picked.push(next.id)
    scheduler.complete()
  }
  return picked
}

describe('createScheduler', () => {
  it('never picks two heavy attacks in a row', () => {
    const heavy = (id: string) => id.startsWith('h')
    for (const seed of ['a', 'b', 'c']) {
      const picked = simulate(MIXED, seed, 300_000)
      expect(picked.some(heavy)).toBe(true)
      for (let i = 1; i < picked.length; i++) expect(heavy(picked[i - 1]) && heavy(picked[i])).toBe(false)
    }
  })

  it.each([
    { quality: 0, idle: 400 },
    { quality: 0.5, idle: 550 },
    { quality: 1, idle: 700 },
  ])('leaves $idle ms to punish after a heavy attack at quality $quality', ({ quality, idle }) => {
    expect(punishWindowMs(quality)).toBe(idle)
    const scheduler = createScheduler(createRng('punish'))
    scheduler.setAttacks([attack('only', true, 0)], quality)
    expect(scheduler.next()?.id).toBe('only')
    scheduler.complete()
    scheduler.tick(idle - 1)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(scheduler.next()?.id).toBe('only')
  })

  it.each([
    { quality: 0, gap: 150 },
    { quality: 0.5, gap: 175 },
    { quality: 1, gap: 200 },
  ])('waits $gap ms after a light attack at quality $quality', ({ quality, gap }) => {
    expect(lightGapMs(quality)).toBe(gap)
    const scheduler = createScheduler(createRng('light'))
    scheduler.setAttacks([attack('only', false, 0)], quality)
    scheduler.next()
    scheduler.complete()
    scheduler.tick(gap - 1)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(scheduler.next()?.id).toBe('only')
  })

  it('clamps the quality', () => {
    expect(punishWindowMs(-3)).toBe(punishWindowMs(0))
    expect(punishWindowMs(5)).toBe(punishWindowMs(1))
    expect(lightGapMs(9)).toBe(lightGapMs(1))
    expect(qualityCooldownScale(-1)).toBe(qualityCooldownScale(0))
  })

  it.each([
    { quality: 0, cooldown: 1800 },
    { quality: 0.5, cooldown: 2400 },
    { quality: 1, cooldown: 3000 },
  ])('recharges after $cooldown ms at quality $quality', ({ quality, cooldown }) => {
    const scheduler = createScheduler(createRng('cooldown'))
    scheduler.setAttacks([attack('slow', true, 3000)], quality)
    scheduler.next()
    scheduler.complete()
    scheduler.tick(cooldown - 1)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(scheduler.next()?.id).toBe('slow')
  })

  it('stacks the cooldown scale of an enraged boss with the quality, and keeps the gap after the attack', () => {
    const scheduler = createScheduler(createRng('enrage'))
    scheduler.setAttacks([attack('slow', true, 3000)], 1)
    scheduler.setCooldownScale(0.5)
    scheduler.next()
    scheduler.complete()
    scheduler.tick(1499)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(scheduler.next()?.id).toBe('slow')
    scheduler.complete()
    scheduler.tick(punishWindowMs(1) - 1)
    scheduler.setCooldownScale(0.01)
    expect(scheduler.next()).toBeNull()
  })

  describe('with every attack on cooldown', () => {
    // A heavy and two lights, all played once so they are all charging.
    const spent = (quality: number) => {
      const scheduler = createScheduler(createRng('starve'))
      scheduler.setAttacks([attack('h', true, 20_000), attack('l1', false, 9000), attack('l2', false, 6000)], quality)
      const seen = new Set<string>()
      for (let guard = 0; guard < 1000 && seen.size < 3; guard++) {
        const picked = scheduler.next()
        if (picked) {
          seen.add(picked.id)
          scheduler.complete(0)
        }
        scheduler.tick(10)
      }
      expect(seen.size).toBe(3)
      return scheduler
    }

    it.each([0, 0.5, 1])('lets a light attack go after the starvation cap at quality %s', (quality) => {
      const scheduler = spent(quality)
      let waited = 0
      let picked = scheduler.next()
      while (!picked && waited < 5000) {
        scheduler.tick(10)
        waited += 10
        picked = scheduler.next()
      }
      expect(picked?.heavy).toBe(false)
      expect(waited).toBeLessThanOrEqual(starveCapMs(quality) + 10)
      expect(waited).toBeGreaterThan(0)
    })

    it('waits longer for a well annotated boss', () => {
      expect(starveCapMs(0)).toBeLessThan(starveCapMs(0.5))
      expect(starveCapMs(0.5)).toBeLessThan(starveCapMs(1))
    })

    it('picks the light attack that is closest to ready', () => {
      const scheduler = spent(0)
      for (let t = 0; t < 2000; t += 10) {
        scheduler.tick(10)
        const picked = scheduler.next()
        if (picked) {
          expect(picked.id).toBe('l2')
          return
        }
      }
      throw new Error('no attack was picked')
    })

    it('never skips the cooldown of a heavy attack or follows a heavy with a heavy', () => {
      const scheduler = createScheduler(createRng('heavies'))
      scheduler.setAttacks([attack('h1', true, 4000), attack('h2', true, 4000), attack('l', false, 5000)], 0)
      let last: SchedulableAttack | null = null
      const heavyAt = new Map<string, number>()
      for (let t = 0; t < 120_000; t += 10) {
        scheduler.tick(10)
        const picked = scheduler.next()
        if (!picked) continue
        if (picked.heavy) {
          expect(last?.heavy ?? false).toBe(false)
          const before = heavyAt.get(picked.id)
          if (before !== undefined) expect(t - before).toBeGreaterThanOrEqual(4000 * qualityCooldownScale(0))
          heavyAt.set(picked.id, t)
        }
        last = picked
        scheduler.complete()
      }
      expect(heavyAt.size).toBe(2)
    })

    it('does not count the time the boss is idle', () => {
      const scheduler = spent(0)
      scheduler.delay(2000)
      scheduler.tick(1900)
      expect(scheduler.next()).toBeNull()
      scheduler.tick(99)
      expect(scheduler.next()).toBeNull()
    })

    it('only lets go a light attack that has weight when the player camps', () => {
      const scheduler = spent(0)
      scheduler.tick(starveCapMs(0) + 10)
      expect(scheduler.next((a) => (a.id === 'l1' ? 1 : 0))?.id).toBe('l1')
      scheduler.complete(0)
      scheduler.tick(starveCapMs(0) + 10)
      expect(scheduler.next((a) => (a.id === 'h' ? 1 : 0))).toBeNull()
    })
  })

  it('still leaves the punish window and the heavy rule when a heavy ends after a phase shift', () => {
    const scheduler = createScheduler(createRng('shift'))
    const heavy = attack('h', true, 0)
    scheduler.setAttacks([heavy, attack('l', false, 0)], 1)
    for (let i = 0; i < 50 && !scheduler.busy(); i++) {
      if (scheduler.next()?.id !== 'h') scheduler.complete(0)
    }
    expect(scheduler.busy()).toBe(true)
    scheduler.setAttacks([heavy, attack('l2', false, 0)], 1, 100)
    scheduler.complete()
    scheduler.tick(punishWindowMs(1) - 1)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(scheduler.next()?.id).toBe('l2')
  })

  it('picks the same sequence for the same seed', () => {
    expect(simulate(MIXED, 'same', 60_000)).toEqual(simulate(MIXED, 'same', 60_000))
  })

  it('switches to the new attack list on a phase change', () => {
    const scheduler = createScheduler(createRng('phase'))
    scheduler.setAttacks([attack('old', false, 5000)], 0)
    scheduler.next()
    scheduler.complete()

    const fresh = [attack('new1', false, 5000), attack('new2', true, 5000)]
    scheduler.setAttacks(fresh, 1, 500)
    expect(scheduler.busy()).toBe(false)
    scheduler.tick(499)
    expect(scheduler.next()).toBeNull()
    scheduler.tick(1)
    expect(fresh.map((a) => a.id)).toContain(scheduler.next()?.id)
  })
})

describe('windupMs', () => {
  it('never shows a zone for less than the minimum flash', () => {
    expect(windupMs(0)).toBe(MIN_WINDUP_MS)
    expect(windupMs(80)).toBe(80)
    expect(windupMs(900)).toBe(900)
  })
})
