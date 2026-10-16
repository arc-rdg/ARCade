import { describe, expect, it, vi } from 'vitest'
import { chain, Rect } from './actorFakes'
import { createActor } from '../../../src/game/phaser/bosses/actor'
import { arenaPlatforms } from '../../../src/game/phaser/bosses/zones'
import { createRng } from '../../../src/game/contracts/rng'
import { STEP_MS } from '../../../src/game/contracts/constants'

vi.mock('phaser', async () => ({ default: (await import('./actorFakes')).PhaserFake }))
vi.mock('../../../src/game/phaser/bosses/sprites', () => ({ applyRef: () => {}, setOriginOf: () => {}, stillTexture: () => 'tex', scaleArt: (a: unknown) => a }))
vi.mock('../../../src/game/phaser/cursors', () => ({ hoverCursor: () => 'default' }))
vi.mock('../../../src/game/phaser/mobs/inspect', () => ({ registerInspectable: () => {} }))
vi.mock('../../../src/game/phaser/bosses/telegraph', async () => {
  const { chain } = await import('./actorFakes')
  return {
    createTelegraphPool: () => ({ show: () => ({ setProgress() {}, activate() {}, release() {} }), update() {}, destroy() {} }),
    createTextPool: () => ({ acquire: () => chain(), release() {}, destroy() {} }),
  }
})
vi.mock('../../../src/game/phaser/bosses/adds', () => ({
  createAdds: () => ({ spawn: () => true, update() {}, clear() {}, destroy() {} }),
}))

const heavyRain = { id: 'r', name: 'Rain', kind: 'rain', heavy: true, telegraphMs: 900, damage: 16, cooldownMs: 3600 }

// A q = 1 boss whose only attack is a heavy rain, with a player standing still on the floor.
function fight(seed: string, platforms: boolean) {
  let now = 0
  const spawned: { until: number; heavy: boolean }[] = []
  const at = { x: 300, y: 0 }
  const box = new Rect()
  const player = {
    id: 'player',
    team: 'player',
    position: () => at,
    hurtbox: () => box.setTo(at.x - 10, -48, 20, 48),
    facing: () => 1,
    isGrounded: () => true,
    isDead: () => false,
    isInvulnerable: () => false,
    receiveHit: () => 0,
  }
  const combat = {
    spawnHitbox: (spec: { activeMs: number; tags: string[] }) => {
      spawned.push({ until: now + spec.activeMs, heavy: spec.tags.includes('heavy') })
      return { cancel() {} }
    },
    spawnProjectile: (spec: { lifetimeMs: number; tags: string[] }) => {
      spawned.push({ until: now + spec.lifetimeMs, heavy: spec.tags.includes('heavy') })
      return { cancel() {} }
    },
    register() {},
    unregister() {},
    cancelOwnedBy() {},
  }
  const art = { projectile: () => ({ textureKey: 'orb', width: 8, height: 8 }), fx: () => 'fx', bossMarker: () => ({ textureKey: 'm', width: 14, height: 14 }), pixelsPerUnit: 1 }
  const phase = { archetype: 'rootTreant', attacks: [heavyRain], quality: 1, showHpBar: true, showAttackNames: true, safeZones: 0, weakPoints: 0, staggerWindowMs: 1600, tells: [], mechanics: [], theme: null }
  const boss = createActor(chain(), {
    id: 'b',
    art: { textureKey: 'b', width: 110, height: 120, parts: {} },
    hp: 1e6,
    phases: [phase],
    killerFor: () => ({}),
    deps: { combat, art, player, rng: createRng(seed) },
    arena: { left: 0, right: 1032, floorY: 0, platforms: platforms ? arenaPlatforms(0, 1032, 0) : [] },
    describe: () => ({}),
  } as never)
  return {
    boss,
    spawned,
    now: () => now,
    step() {
      boss.update(STEP_MS)
      now += STEP_MS
    },
    hit(heavy: boolean) {
      boss.receiveHit({ attacker: player, target: boss, damage: heavy ? 36 : 12, crit: false, knockback: { x: 0, y: 0 }, tags: [heavy ? 'heavy' : 'light'], stagger: 1 } as never)
    },
  }
}

const SETUPS = [
  { seed: 'a', platforms: false },
  { seed: 'b', platforms: true },
  { seed: 'c', platforms: true },
  { seed: 'd', platforms: true },
]

describe('the stagger bar during a heavy rain', () => {
  it.each(SETUPS)('does not move while locked and keeps what it had ($seed, platforms $platforms)', ({ seed, platforms }) => {
    const f = fight(seed, platforms)
    f.hit(false)
    f.hit(false)
    const before = f.boss.staggerFraction()
    expect(before).toBeGreaterThan(0)
    for (let guard = 0; f.boss.staggerState() !== 'locked' && guard < 2000; guard++) f.step()
    expect(f.boss.staggerState()).toBe('locked')
    while (f.boss.staggerState() === 'locked') {
      f.hit(true)
      expect(f.boss.staggerFraction()).toBe(before)
      f.step()
    }
    expect(f.boss.staggerFraction()).toBe(before)
  })

  it.each(SETUPS)('stays locked until every drop has landed ($seed, platforms $platforms)', ({ seed, platforms }) => {
    const f = fight(seed, platforms)
    for (let guard = 0; f.boss.staggerState() !== 'locked' && guard < 2000; guard++) f.step()
    while (f.boss.staggerState() === 'locked') f.step()
    expect(f.spawned.length).toBeGreaterThan(0)
    expect(f.spawned.filter((s) => s.heavy && s.until > f.now())).toEqual([])
  })
})
