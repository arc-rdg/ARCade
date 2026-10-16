import type { BodyKind, EnemyWeaponKind } from '../../contracts/content'
import {
  ATTACK_COOLDOWN_FLOOR_MS,
  DIVE_MIN_DISTANCE,
  RANGED_BACKOFF_FAR,
  RANGED_BACKOFF_NEAR,
  RANGED_MIN_LEAD_MS,
  WINDUP_HOLD_MS,
  WINDUP_RAMP_MS,
} from './tuning'

// Pure rules for the wind-up tells, the ranged lead, the contact cap and the back-away of ranged mobs.

const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

// How far into its pose a wind-up has got, 0 to 1 and still linear. The pose forms in the first
// WINDUP_RAMP_MS and is held for at least WINDUP_HOLD_MS before the strike. Weapon and body ease
// this value out, so about 3/4 of the pose is there after 100 ms.
export function windupProgress(elapsedMs: number, totalMs: number): number {
  const ramp = Math.max(1, Math.min(WINDUP_RAMP_MS, totalMs - WINDUP_HOLD_MS))
  return clamp01(elapsedMs / ramp)
}

// The share of the body pose that is formed, 0 to 1.
export function windupForm(elapsedMs: number, totalMs: number): number {
  return easeOut(windupProgress(elapsedMs, totalMs))
}

// The body's anticipation at full form. `lean` is degrees back, away from the target, `sx` and `sy`
// scale the sprite and `step` moves it back, in world units.
export interface BodyPose {
  lean: number
  sx: number
  sy: number
  step: number
}

export const NO_POSE: BodyPose = { lean: 0, sx: 1, sy: 1, step: 0 }

const BODY_POSES: Partial<Record<EnemyWeaponKind, BodyPose>> = {
  // Leans back and sinks, the claw raised over the head.
  claw: { lean: 12, sx: 1.06, sy: 0.92, step: 0 },
  // Twists back with a step away from the target.
  whip: { lean: 8, sx: 1.03, sy: 0.96, step: 4 },
  spear: { lean: 8, sx: 1, sy: 0.97, step: 0 },
  // Braces in a crouch.
  shield: { lean: 0, sx: 1.08, sy: 0.88, step: 0 },
  bow: { lean: 6, sx: 1, sy: 0.97, step: 0 },
  // Stretches up with the wand held high.
  wand: { lean: 0, sx: 0.95, sy: 1.1, step: 0 },
}

// A golem rises on its toes instead, whatever it swings.
const GOLEM_POSE: BodyPose = { lean: 0, sx: 0.96, sy: 1.08, step: 0 }

// Thrown weapons keep their old tell: the arm cocks back and the body stays put.
export function bodyWindupPose(weapon: EnemyWeaponKind, body: BodyKind): BodyPose {
  const base = BODY_POSES[weapon] ?? NO_POSE
  return body === 'golem' ? { ...base, sx: GOLEM_POSE.sx, sy: GOLEM_POSE.sy } : base
}

// The wind-up of a straight shot, lengthened at point-blank so that wind-up plus flight to the
// target is at least RANGED_MIN_LEAD_MS. Lobbed shots (speed 0) keep their wind-up.
export function rangedWindupMs(baseMs: number, distance: number, speed: number): number {
  if (speed <= 0) return baseMs
  const flightMs = (Math.max(0, distance) / speed) * 1000
  return Math.max(baseMs, Math.round(RANGED_MIN_LEAD_MS - flightMs))
}

// A mob's touch hurts no more than its own weapon, except while its body is the weapon.
export function contactDamageFor(contact: number, weaponDamage: number, bodyIsWeapon: boolean): number {
  return bodyIsWeapon ? contact : Math.min(contact, weaponDamage)
}

export function attackCooldownMs(baseMs: number, multiplier: number): number {
  return Math.max(ATTACK_COOLDOWN_FLOOR_MS, baseMs * multiplier)
}

// What a bat with a ready dive does: start the wind-up, fly off first when it is too close, or wait
// (off screen). Both the start and the aim lock need the minimum distance.
export function diveDecision(distance: number, onScreen: boolean): 'windup' | 'reposition' | 'wait' {
  if (distance < DIVE_MIN_DISTANCE) return 'reposition'
  return onScreen ? 'windup' : 'wait'
}

export function diveLocks(distance: number): boolean {
  return distance >= DIVE_MIN_DISTANCE
}

// A ranged mob starts backing away when the player is nearer than RANGED_BACKOFF_NEAR and stops
// beyond RANGED_BACKOFF_FAR, so it does not flicker at the edge.
export function wantsToBackOff(distance: number, backingOff: boolean): boolean {
  if (distance < RANGED_BACKOFF_NEAR) return true
  if (distance > RANGED_BACKOFF_FAR) return false
  return backingOff
}

// Which way the retreat goes: away from the player, or 0 when a wall or a ledge is in the way.
// `dx` is the player's offset from the mob.
export function retreatDirection(dx: number, wallBehind: boolean, ledgeBehind: boolean): -1 | 0 | 1 {
  if (wallBehind || ledgeBehind) return 0
  return dx >= 0 ? -1 : 1
}
