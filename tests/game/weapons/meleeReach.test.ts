import { describe, expect, it } from 'vitest'
import type { HitboxSpec } from '../../../src/game/contracts/combat'
import type { AttackContext, AttackMove, WeaponMoveset } from '../../../src/game/contracts/player'
import { staffMoveset } from '../../../src/game/phaser/player/staffMoveset'
import { beakerMoveset } from '../../../src/game/phaser/player/weapons/heavy'
import { bindScheduler } from '../../../src/game/phaser/player/weapons/kit'
import { pressMoveset } from '../../../src/game/phaser/player/weapons/legendaryMoves'
import { scalpelMoveset, whipMoveset } from '../../../src/game/phaser/player/weapons/light'
import { createScheduler } from '../../../src/game/phaser/player/weapons/scheduler'

// The forward edge of the furthest box a move spawns, relative to the feet, at range scale 1.
function reachOf(move: AttackMove, tier: 1 | 2): number {
  const spawned: HitboxSpec[] = []
  const scheduler = createScheduler()
  const player = {
    position: () => ({ x: 0, y: 0 }),
    facing: () => 1,
    getBuild: () => ({ stats: { attackSpeed: 1 } }),
    isGrounded: () => true,
    isDead: () => false,
  }
  const unbind = bindScheduler(player, scheduler)
  const ctx = {
    scene: { physics: { overlapRect: () => [] } },
    art: { projectile: () => ({ textureKey: 't', animKey: 'a' }) },
    combat: {
      spawnHitbox: (spec: HitboxSpec) => {
        spawned.push(spec)
        return { cancel() {} }
      },
      spawnProjectile: () => ({ cancel() {} }),
      livingCombatants: () => [],
      cancelShots: () => 0,
    },
    player,
    aim: { x: 100, y: -20 },
    tier,
    rangeScale: 1,
    held: new Set(),
  } as unknown as AttackContext
  move.onActive(ctx)
  for (let i = 0; i < 5; i++) scheduler.update(5000)
  unbind()
  let reach = -Infinity
  for (const spec of spawned) if (spec.shape.kind === 'rect') reach = Math.max(reach, spec.shape.x + spec.shape.w)
  return reach
}

// How far a lunge pushed the mage during its 60 ms push: speed times 0.06 s.
const LUNGE_SECONDS = 0.06

// The moves that lost their lunge: the old lunge speed and the forward edge of the box before.
const TABLE: { name: string; set: WeaponMoveset; slot: 'light' | 'heavy'; index: number; lunge: number; before: number }[] = [
  { name: 'Staff jab', set: staffMoveset, slot: 'light', index: 0, lunge: 140, before: 72 },
  { name: 'Staff jab 2', set: staffMoveset, slot: 'light', index: 1, lunge: 140, before: 72 },
  { name: 'Staff thrust', set: staffMoveset, slot: 'light', index: 2, lunge: 220, before: 76 },
  { name: 'Staff slam', set: staffMoveset, slot: 'heavy', index: 0, lunge: 80, before: 70 },
  { name: 'Scalpel cut', set: scalpelMoveset, slot: 'light', index: 0, lunge: 120, before: 52 },
  { name: 'Scalpel cut 3', set: scalpelMoveset, slot: 'light', index: 2, lunge: 120, before: 52 },
  { name: 'Scalpel slash', set: scalpelMoveset, slot: 'light', index: 3, lunge: 200, before: 52 },
  { name: 'Whip lash', set: whipMoveset, slot: 'light', index: 0, lunge: 60, before: 74 },
  { name: 'Whip crack', set: whipMoveset, slot: 'light', index: 1, lunge: 100, before: 74 },
  { name: 'Beaker smash', set: beakerMoveset, slot: 'heavy', index: 0, lunge: 60, before: 58 },
  { name: 'Publish', set: pressMoveset, slot: 'heavy', index: 0, lunge: 40, before: 64 },
]

describe('melee reach without lunges', () => {
  for (const row of TABLE) {
    for (const tier of [1, 2] as const) {
      it(`${row.name} tier ${tier} reaches as far as it did with its lunge`, () => {
        const move = row.set.moves(row.slot, tier)[row.index]
        expect(reachOf(move, tier)).toBeGreaterThanOrEqual(row.before + row.lunge * LUNGE_SECONDS - 1e-9)
      })
    }
  }
})
