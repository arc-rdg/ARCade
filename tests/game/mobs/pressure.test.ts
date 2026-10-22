import { describe, expect, it } from 'vitest'
import {
  closesIn,
  dropDecision,
  dropWait,
  isStranded,
  lungeDistance,
  lunges,
  pressesPlayer,
  roomBefore,
} from '../../../src/game/phaser/mobs/pressure'
import { DROP_DELAY_MS, DROP_MIN_BELOW, GOLEM_LUNGE_MAX, LUNGE_MAX, MELEE, GOLEM_WINDUP_MS, MELEE_APPROACH_RANGE } from '../../../src/game/phaser/mobs/tuning'

const open = { wallRoom: 999, groundRoom: 999 }

describe('closing in', () => {
  it('walks toward a player who is out of reach but inside the approach range', () => {
    expect(pressesPlayer(MELEE_APPROACH_RANGE - 10, false, 160)).toBe(true)
    expect(closesIn(80, 12)).toBe(true)
  })

  it('stays put beyond the approach range and holds once the player is in the swing', () => {
    expect(pressesPlayer(MELEE_APPROACH_RANGE + 40, false, 160)).toBe(false)
    expect(closesIn(10, 12)).toBe(false)
  })

  it('keeps pressing a little past the range it started at, so the edge does not flicker', () => {
    const edge = MELEE_APPROACH_RANGE + 20
    expect(pressesPlayer(edge, false, 160)).toBe(false)
    expect(pressesPlayer(edge, true, 160)).toBe(true)
  })

  it('never shrinks a longer aggro range', () => {
    expect(pressesPlayer(300, false, 320)).toBe(true)
  })
})

describe('lunge', () => {
  const base = { weaponRange: 28, maxDash: LUNGE_MAX, ...open }

  it('covers the gap up to a comfortable reach', () => {
    expect(lungeDistance({ ...base, gap: 50 })).toBe(36)
  })

  it('is capped at the maximum dash', () => {
    expect(lungeDistance({ ...base, gap: 200 })).toBe(LUNGE_MAX)
    expect(lungeDistance({ ...base, gap: 200, maxDash: GOLEM_LUNGE_MAX })).toBe(GOLEM_LUNGE_MAX)
    expect(GOLEM_LUNGE_MAX).toBeLessThan(LUNGE_MAX)
  })

  it('does not dash when the player is already in reach', () => {
    expect(lungeDistance({ ...base, gap: 28 })).toBe(0)
    expect(lungeDistance({ ...base, gap: 5 })).toBe(0)
  })

  it('stops before a wall or a ledge', () => {
    expect(lungeDistance({ ...base, gap: 200, wallRoom: 24, groundRoom: 999 })).toBe(24)
    expect(lungeDistance({ ...base, gap: 200, wallRoom: 999, groundRoom: 16 })).toBe(16)
  })

  it('skips a dash that would barely move the mob', () => {
    expect(lungeDistance({ ...base, gap: 200, groundRoom: 3 })).toBe(0)
    expect(lungeDistance({ ...base, gap: 200, groundRoom: 0 })).toBe(0)
  })

  it('finds the room before the first blocked step', () => {
    expect(roomBefore(8, 7, (k) => k >= 4)).toBe(24)
    expect(roomBefore(8, 7, () => false)).toBe(56)
    expect(roomBefore(8, 7, (k) => k === 1)).toBe(0)
  })

  it('is for ground melee mobs only, not beetles, bats, wisps or turrets', () => {
    expect(lunges(true, false, 'golem')).toBe(true)
    expect(lunges(true, false, 'slime')).toBe(true)
    expect(lunges(true, true, 'bat')).toBe(false)
    expect(lunges(true, false, 'beetle')).toBe(false)
    expect(lunges(true, false, 'turret')).toBe(false)
    expect(lunges(false, false, 'imp')).toBe(false)
  })
})

describe('wind-up timings', () => {
  it('stay as they were: the dash comes after the tell', () => {
    expect(MELEE.claw.windupMs).toBe(320)
    expect(MELEE.whip.windupMs).toBe(340)
    expect(MELEE.spear.windupMs).toBe(360)
    expect(MELEE.shield.windupMs).toBe(380)
    expect(GOLEM_WINDUP_MS).toBe(50)
  })
})

describe('coming down off a platform', () => {
  const stranded = { canDrop: true, aggro: true, onGround: true, below: DROP_MIN_BELOW + 30, inReach: false }

  it('counts a melee mob as stranded when the player is lower and out of reach', () => {
    expect(isStranded(stranded)).toBe(true)
  })

  it('is not stranded when the player is level, in reach, or the mob cannot drop', () => {
    expect(isStranded({ ...stranded, below: 4 })).toBe(false)
    expect(isStranded({ ...stranded, inReach: true })).toBe(false)
    expect(isStranded({ ...stranded, canDrop: false })).toBe(false)
    expect(isStranded({ ...stranded, aggro: false })).toBe(false)
    expect(isStranded({ ...stranded, onGround: false })).toBe(false)
  })

  it('waits while stranded and starts over when the player comes into reach', () => {
    let wait = 0
    for (let i = 0; i < 30; i++) wait = dropWait(wait, 16, true)
    expect(wait).toBe(480)
    expect(dropWait(wait, 16, false)).toBe(0)
  })

  it('drops after the delay only when there is ground below', () => {
    expect(dropDecision(DROP_DELAY_MS - 1, true, true)).toBe('wait')
    expect(dropDecision(DROP_DELAY_MS, true, true)).toBe('drop')
    expect(dropDecision(DROP_DELAY_MS + 500, true, false)).toBe('stay')
    expect(dropDecision(DROP_DELAY_MS + 500, false, true)).toBe('wait')
  })

  it('does not apply to ranged mobs', () => {
    const ranged = lunges(false, false, 'imp')
    expect(isStranded({ ...stranded, canDrop: ranged })).toBe(false)
  })
})
