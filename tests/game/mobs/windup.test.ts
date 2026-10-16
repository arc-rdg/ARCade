import { describe, expect, it } from 'vitest'
import { MELEE, RANGED, GOLEM_WINDUP_MS, ATTACK_COOLDOWN_FLOOR_MS, DIVE_MIN_DISTANCE, RANGED_BACKOFF_FAR, RANGED_BACKOFF_NEAR, RANGED_MIN_LEAD_MS } from '../../../src/game/phaser/mobs/tuning'
import { poseWeapon } from '../../../src/game/phaser/mobs/weaponPose'
import type { WeaponPose } from '../../../src/game/phaser/mobs/weaponPose'
import {
  attackCooldownMs,
  bodyWindupPose,
  contactDamageFor,
  diveDecision,
  diveLocks,
  rangedWindupMs,
  retreatDirection,
  wantsToBackOff,
  windupForm,
  windupProgress,
} from '../../../src/game/phaser/mobs/windup'

const swings = Object.entries(MELEE) as ['claw' | 'whip' | 'spear' | 'shield', (typeof MELEE)['claw']][]

describe('wind-up pose', () => {
  it('has the body pose at least 70 percent formed after 100 ms, for every melee and straight shot', () => {
    for (const [, tune] of swings) {
      expect(windupForm(100, tune.windupMs)).toBeGreaterThanOrEqual(0.7)
      expect(windupForm(100, tune.windupMs + GOLEM_WINDUP_MS)).toBeGreaterThanOrEqual(0.7)
    }
    for (const kind of ['bow', 'wand'] as const) expect(windupForm(100, RANGED[kind].windupMs)).toBeGreaterThanOrEqual(0.7)
  })

  it('has the weapon at least 70 percent of the way back after 100 ms and holds it for the last 80 ms', () => {
    const out: WeaponPose = { angle: 0, dx: 0, dy: 0, scale: 1, visible: true }
    for (const [kind, tune] of swings) {
      const at = (ms: number) => poseWeapon(out, { kind, stage: 'windup', t: windupProgress(ms, tune.windupMs), length: 30, rest: -0.2, aim: 0, lunge: 10, sway: 0 }).angle
      const rest = -0.2
      const full = at(tune.windupMs)
      expect((at(100) - rest) / (full - rest)).toBeGreaterThanOrEqual(0.7)
      expect(at(tune.windupMs - 80)).toBeCloseTo(full)
    }
  })

  it('gives the golem a rise on its toes and the claw a lean back', () => {
    expect(bodyWindupPose('claw', 'crawler').lean).toBe(12)
    expect(bodyWindupPose('claw', 'golem').sy).toBeCloseTo(1.08)
    expect(bodyWindupPose('whip', 'crawler').step).toBe(4)
  })
})

describe('rangedWindupMs', () => {
  it('leaves at least 450 ms from the start of the wind-up to the hit at any distance', () => {
    for (const kind of ['bow', 'wand'] as const) {
      const { windupMs, speed } = RANGED[kind]
      for (let distance = 40; distance <= 300; distance += 10) {
        const lead = rangedWindupMs(windupMs, distance, speed) + (distance / speed) * 1000
        expect(lead).toBeGreaterThanOrEqual(RANGED_MIN_LEAD_MS - 1)
      }
    }
  })

  it('keeps the base wind-up for far shots and for lobs', () => {
    expect(rangedWindupMs(250, 400, 320)).toBe(250)
    expect(rangedWindupMs(300, 40, 0)).toBe(300)
  })

  it('adds the golem bonus on top at every distance and still leaves the minimum lead', () => {
    for (const kind of ['bow', 'wand'] as const) {
      const { windupMs, speed } = RANGED[kind]
      for (let distance = 40; distance <= 400; distance += 20) {
        const golem = rangedWindupMs(windupMs + GOLEM_WINDUP_MS, distance, speed)
        expect(golem).toBeGreaterThanOrEqual(rangedWindupMs(windupMs, distance, speed))
        expect(golem + (distance / speed) * 1000).toBeGreaterThanOrEqual(RANGED_MIN_LEAD_MS - 1)
      }
    }
    expect(rangedWindupMs(300 + GOLEM_WINDUP_MS, 40, 0)).toBe(350)
  })
})

describe('contact damage and cooldown', () => {
  it('caps a touch at the weapon damage unless the body is the weapon', () => {
    expect(contactDamageFor(20, 8, false)).toBe(8)
    expect(contactDamageFor(5, 8, false)).toBe(5)
    expect(contactDamageFor(20, 8, true)).toBe(20)
  })

  it('floors the attack cooldown after the multipliers', () => {
    expect(attackCooldownMs(700, 0.7)).toBe(ATTACK_COOLDOWN_FLOOR_MS)
    expect(attackCooldownMs(900, 0.7)).toBe(ATTACK_COOLDOWN_FLOOR_MS)
    expect(attackCooldownMs(2000, 0.7)).toBeCloseTo(1400)
  })
})

describe('bat dive', () => {
  it('flies off first when the player is closer than the minimum and winds up from further away', () => {
    for (let distance = 0; distance < DIVE_MIN_DISTANCE; distance += 5) expect(diveDecision(distance, true)).toBe('reposition')
    expect(diveDecision(DIVE_MIN_DISTANCE, true)).toBe('windup')
    expect(diveDecision(200, true)).toBe('windup')
  })

  it('waits while it is off screen and drops the dive when the aim locks too close', () => {
    expect(diveDecision(200, false)).toBe('wait')
    expect(diveLocks(DIVE_MIN_DISTANCE - 1)).toBe(false)
    expect(diveLocks(DIVE_MIN_DISTANCE)).toBe(true)
  })
})

describe('ranged back-away', () => {
  it('starts when the player is close, stops when far and keeps going in between', () => {
    expect(wantsToBackOff(RANGED_BACKOFF_NEAR - 1, false)).toBe(true)
    expect(wantsToBackOff((RANGED_BACKOFF_NEAR + RANGED_BACKOFF_FAR) / 2, true)).toBe(true)
    expect(wantsToBackOff((RANGED_BACKOFF_NEAR + RANGED_BACKOFF_FAR) / 2, false)).toBe(false)
    expect(wantsToBackOff(RANGED_BACKOFF_FAR + 1, true)).toBe(false)
  })

  it('moves away from the player', () => {
    expect(retreatDirection(40, false, false)).toBe(-1)
    expect(retreatDirection(-40, false, false)).toBe(1)
  })

  it('stops at a ledge or a wall behind it, so it never falls and never pushes into a wall', () => {
    expect(retreatDirection(40, false, true)).toBe(0)
    expect(retreatDirection(-40, true, false)).toBe(0)
  })
})
