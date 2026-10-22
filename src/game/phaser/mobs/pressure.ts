import {
  DROP_DELAY_MS,
  DROP_MIN_BELOW,
  LUNGE_MIN,
  LUNGE_STOP_SHARE,
  MELEE_APPROACH_RANGE,
  AGGRO_RELEASE,
} from './tuning'

// Pure rules that make melee mobs press the player: closing in from a distance, the lunge at the end
// of a wind-up, and coming down off a platform the player is not on.

// A ground melee mob notices a player this far away, even when its own aggro range is shorter. The
// range stretches by AGGRO_RELEASE once it is pressing, so the edge does not flicker.
export function pressesPlayer(distance: number, wasPressing: boolean, aggroRange: number): boolean {
  const range = Math.max(aggroRange, MELEE_APPROACH_RANGE) * (wasPressing ? AGGRO_RELEASE : 1)
  return distance <= range
}

// A melee mob walks toward a player that is out of its swing, and holds once the gap closes to
// `holdGap`. The same gap is where a lunge ends.
export function closesIn(gap: number, holdGap: number): boolean {
  return gap > holdGap
}

export interface LungeInput {
  // Free space between the two bodies.
  gap: number
  weaponRange: number
  // The weapon's dash cap.
  maxDash: number
  // Room before a wall and before the front edge would leave the ground.
  wallRoom: number
  groundRoom: number
}

// How far the mob dashes at the end of its wind-up. Zero while the player is already in reach, so a
// lunge never pushes the mob into the player. Otherwise it covers the gap up to the point where the
// swing reaches comfortably, never more than the dash cap and never past a wall or a ledge.
export function lungeDistance(input: LungeInput): number {
  if (input.gap <= input.weaponRange) return 0
  const toStop = input.gap - input.weaponRange * LUNGE_STOP_SHARE
  const distance = Math.min(toStop, input.maxDash, input.wallRoom, input.groundRoom)
  return distance >= LUNGE_MIN ? distance : 0
}

// How many whole steps of `step` fit before the first blocked one. `blocked(k)` tells whether the
// k-th step (1 based) is blocked.
export function roomBefore(step: number, count: number, blocked: (k: number) => boolean): number {
  for (let k = 1; k <= count; k++) if (blocked(k)) return (k - 1) * step
  return count * step
}

export interface StrandedInput {
  // Ground melee body that may leave its platform (crawlers never do).
  canDrop: boolean
  aggro: boolean
  onGround: boolean
  // The player's feet below the mob's feet, in world units.
  below: number
  inReach: boolean
}

// The player is lower than the mob and out of its swing, so the mob has no way to hit them.
export function isStranded(input: StrandedInput): boolean {
  return input.canDrop && input.aggro && input.onGround && !input.inReach && input.below >= DROP_MIN_BELOW
}

// The wait grows while the mob is stranded and starts over as soon as it is not.
export function dropWait(waitMs: number, dtMs: number, stranded: boolean): number {
  return stranded ? waitMs + dtMs : 0
}

// What a stranded mob does once it has waited: step off a ledge, drop through a plank, or stay.
// `ground` says whether there is floor below within a sane distance, so a pit is never entered.
export function dropDecision(waitMs: number, stranded: boolean, ground: boolean): 'wait' | 'drop' | 'stay' {
  if (!stranded || waitMs < DROP_DELAY_MS) return 'wait'
  return ground ? 'drop' : 'stay'
}

// A weapon lunges when it is a melee one on a ground body that is not a beetle or a turret.
export function lunges(melee: boolean, flies: boolean, body: string): boolean {
  return melee && !flies && body !== 'beetle' && body !== 'turret'
}

