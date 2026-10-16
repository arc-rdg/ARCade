import { describe, expect, it, vi } from 'vitest'
import { chain, Rect } from './actorFakes'
import { createActor } from '../../../src/game/phaser/bosses/actor'
import { createRng } from '../../../src/game/contracts/rng'
import { STEP_MS } from '../../../src/game/contracts/constants'
import { TELL_LEAD_MS } from '../../../src/game/phaser/bosses/tellLead'

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

const heavyRain = { id: 'r', name: 'Rain', kind: 'rain', heavy: true, telegraphMs: 900, damage: 16 }

// A specimen jar with a tell and one heavy attack, facing a player who stays far away.
function fight(seed: string) {
  const at = { x: 0, y: 0 }
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
    spawnHitbox: () => ({ cancel() {} }),
    spawnProjectile: () => ({ cancel() {} }),
    register() {},
    unregister() {},
    cancelOwnedBy() {},
  }
  const art = { projectile: () => ({ textureKey: 'orb', width: 8, height: 8 }), fx: () => 'fx', bossMarker: () => ({ textureKey: 'm', width: 14, height: 14 }), pixelsPerUnit: 1 }
  const tell = { name: 'Tell', value: '1', unit: 'x' }
  const phase = { archetype: 'specimenJar', attacks: [heavyRain], quality: 1, showHpBar: true, showAttackNames: true, safeZones: 0, weakPoints: 0, staggerWindowMs: 1600, tells: [tell], mechanics: [], theme: null }
  const boss = createActor(chain(), {
    id: 'b',
    art: { textureKey: 'b', width: 110, height: 120, parts: {} },
    hp: 1e6,
    phases: [phase],
    killerFor: () => ({}),
    deps: { combat, art, player, rng: createRng(seed) },
    arena: { left: 0, right: 1032, floorY: 0, platforms: [] },
    describe: () => ({}),
  } as never)
  return { boss, at }
}

describe('the tell lead of a specimen jar', () => {
  // The player stands close, so the jar does not hop, then walks away at some moment of the fight.
  it.each(Array.from({ length: 16 }, (_, i) => 1000 + i * 40))('stays on the floor and in place until the attack starts, player leaves at %d ms', (leaveMs) => {
    const { boss, at } = fight('lead')
    at.x = boss.position().x + 60
    const near = at.x
    const history: { x: number; y: number }[] = []
    let named = false
    for (let step = 0; step < 400; step++) {
      if (step * STEP_MS >= leaveMs) at.x = near + 300
      boss.update(STEP_MS)
      history.push({ ...boss.position() })
      const now = boss.currentAttackName() !== null
      if (now && !named) {
        // The steps before the wind-up are the lead, minus the one that ends it.
        const lead = history.slice(-(Math.floor(TELL_LEAD_MS / STEP_MS) - 1), -1)
        for (const p of lead) expect(p).toEqual(lead[0])
        return
      }
      named = now
    }
    throw new Error('The attack never started')
  })
})
