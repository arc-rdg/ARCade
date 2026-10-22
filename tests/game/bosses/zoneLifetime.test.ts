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
vi.mock('../../../src/game/phaser/bosses/adds', () => ({
  createAdds: () => ({ spawn: () => true, update() {}, clear() {}, destroy() {} }),
}))

interface FakeZone {
  tag: number
  safe: boolean
  from: number
  to: number
  shownFrom: number
  shownTo: number
  alive: boolean
  born: number
  // The part shown after each step since born, or null once it was cleared.
  log: ({ lo: number; hi: number } | null)[]
}

const world = vi.hoisted(() => ({ zones: [] as FakeZone[], step: 0, tag: 0 }))

vi.mock('../../../src/game/phaser/bosses/telegraph', async () => {
  const { chain } = await import('./actorFakes')
  return {
    createTelegraphPool: () => ({
      show: (spec: { x: number; w: number; fill: string; safe?: boolean }) => {
        const from = spec.fill === 'right' ? spec.x : spec.fill === 'left' ? spec.x - spec.w : spec.x - spec.w / 2
        const zone: FakeZone = { tag: world.tag, safe: !!spec.safe, from, to: from + spec.w, shownFrom: from, shownTo: from + spec.w, alive: true, born: world.step, log: [] }
        world.zones.push(zone)
        return {
          setProgress() {},
          activate() {},
          trim(a: number, b: number) {
            if (!zone.alive) return
            zone.shownFrom = Math.max(zone.from, a)
            zone.shownTo = Math.min(zone.to, b)
          },
          fade() {
            zone.alive = false
          },
          release() {
            zone.alive = false
          },
        }
      },
      update() {},
      destroy() {},
    }),
    createTextPool: () => ({ acquire: () => chain(), release() {}, destroy() {} }),
  }
})

interface Hit {
  tag: number
  until: number
  // The x range at each step it was active.
  at: Map<number, { lo: number; hi: number }>
  range: () => { lo: number; hi: number }
}

const ARENA = { left: 0, right: 1032 }

function fight(kind: string, seed: string, opts: { platforms?: boolean; safeZones?: number; onPlatform?: boolean } = {}) {
  world.zones.length = 0
  world.step = 0
  world.tag = 0
  let now = 0
  const hits: Hit[] = []
  const platforms = opts.platforms ? arenaPlatforms(0, 1032, 0) : []
  const at = opts.onPlatform ? { x: platforms[1].x + 40, y: -60 } : { x: 300, y: 0 }
  const box = new Rect()
  const player = {
    id: 'player',
    team: 'player',
    position: () => at,
    hurtbox: () => box.setTo(at.x - 10, at.y - 48, 20, 48),
    facing: () => 1,
    isGrounded: () => true,
    isDead: () => false,
    isInvulnerable: () => false,
    receiveHit: () => 0,
  }
  const combat = {
    spawnHitbox: (spec: { owner: { position(): { x: number }; facing(): number }; shape: { kind: string; x: number; w?: number; r?: number }; follow: boolean; activeMs: number }) => {
      const { owner, shape } = spec
      const width = shape.kind === 'circle' ? 2 * (shape.r ?? 0) : (shape.w ?? 0)
      const left = shape.kind === 'circle' ? shape.x - (shape.r ?? 0) : shape.x
      const place = (ox: number, facing: number) => (facing === 1 ? ox + left : ox - left - width)
      const fixedFrom = place(owner.position().x, owner.facing())
      const range = (): { lo: number; hi: number } => {
        const lo = spec.follow ? place(owner.position().x, owner.facing()) : fixedFrom
        return { lo, hi: lo + width }
      }
      hits.push({ tag: world.tag, until: now + spec.activeMs, at: new Map(), range })
      return { cancel() {} }
    },
    spawnProjectile: (spec: { shape: { kind: string; w?: number; r?: number }; velocity: { x: number }; lifetimeMs: number }, pos: { x: number }) => {
      const half = spec.shape.kind === 'circle' ? (spec.shape.r ?? 0) : (spec.shape.w ?? 0) / 2
      const born = now
      hits.push({
        tag: world.tag,
        until: now + spec.lifetimeMs,
        at: new Map(),
        range: () => {
          const x = pos.x + (spec.velocity.x * (now - born)) / 1000
          return { lo: x - half, hi: x + half }
        },
      })
      return { cancel() {} }
    },
    register() {},
    unregister() {},
    cancelOwnedBy() {},
  }
  const art = { projectile: () => ({ textureKey: 'orb', width: 8, height: 8 }), fx: () => 'fx', bossMarker: () => ({ textureKey: 'm', width: 14, height: 14 }), pixelsPerUnit: 1 }
  const attack = { id: 'a', name: 'Attack', kind, heavy: true, telegraphMs: 900, damage: 16, cooldownMs: 3600 }
  const phase = { archetype: 'rootTreant', attacks: [attack], quality: 1, showHpBar: true, showAttackNames: true, safeZones: opts.safeZones ?? 0, weakPoints: 0, staggerWindowMs: 1600, tells: [], mechanics: [], theme: null }
  const boss = createActor(chain(), {
    id: 'b',
    art: { textureKey: 'b', width: 110, height: 120, parts: {} },
    hp: 1e6,
    phases: [phase],
    killerFor: () => ({}),
    deps: { combat, art, player, rng: createRng(seed) },
    arena: { ...ARENA, floorY: 0, platforms },
    describe: () => ({}),
  } as never)
  function step() {
    const was = boss.currentAttackName() !== null
    world.tag = was ? world.tag : world.tag + 1
    boss.update(STEP_MS)
    for (const hit of hits) if (hit.until - now > 1e-6) hit.at.set(world.step, hit.range())
    for (const zone of world.zones) if (zone.born <= world.step && zone.log.length <= world.step - zone.born) zone.log.push(zone.alive ? { lo: zone.shownFrom, hi: zone.shownTo } : null)
    now += STEP_MS
    world.step++
  }
  return { step, hits, zones: world.zones, boss }
}

const KINDS = ['slam', 'sweep', 'charge', 'rain', 'beam', 'shockwave', 'pillars']
const SETUPS = [
  { seed: 'a', platforms: false, safeZones: 0, onPlatform: false },
  { seed: 'b', platforms: true, safeZones: 2, onPlatform: false },
  { seed: 'c', platforms: true, safeZones: 0, onPlatform: true },
  { seed: 'd', platforms: true, safeZones: 1, onPlatform: true },
  { seed: 'e', platforms: true, safeZones: 0, onPlatform: false },
]
const STEPS = 1800

function overlap(a: { lo: number; hi: number }, lo: number, hi: number): number {
  return Math.min(a.hi, hi) - Math.max(a.lo, lo)
}

describe('danger zones clear with their hitboxes', () => {
  it.each(KINDS.flatMap((kind) => SETUPS.map((setup) => ({ kind, ...setup }))))('never clears a part a hitbox can still hit ($kind, seed $seed, platforms $platforms, camping $onPlatform)', ({ kind, ...setup }) => {
    const f = fight(kind, setup.seed, setup)
    for (let i = 0; i < STEPS; i++) f.step()
    const danger = f.zones.filter((z) => !z.safe)
    expect(danger.length).toBeGreaterThan(0)
    let bad = ''
    for (const zone of danger) {
      const hits = f.hits.filter((h) => h.tag === zone.tag)
      for (let k = 0; k < zone.log.length && !bad; k++) {
        const shown = zone.log[k]
        const t = zone.born + k
        const parts = shown ? [[zone.from, shown.lo], [shown.hi, zone.to]] : [[zone.from, zone.to]]
        for (const hit of hits) {
          for (const [s, range] of hit.at) {
            if (s < t) continue
            for (const [lo, hi] of parts) if (overlap(range, lo, hi) >= 0.5) bad = `${kind}: ${lo}..${hi} cleared at step ${t}, hit at step ${s}`
          }
        }
      }
    }
    expect(bad).toBe('')
  })
})

// Every x of a zone that is shown after the strike has to be hit now or later, and an x that
// has been passed is not shown for longer than this.
const GONE_MS = 150

function checkFront(kind: string, seed: string, slack: number) {
  const f = fight(kind, seed)
  for (let i = 0; i < STEPS; i++) f.step()
  const danger = f.zones.filter((z) => !z.safe)
  expect(danger.length).toBeGreaterThan(0)
  let shrunk = 0
  let bad = ''
  for (const zone of danger.filter((z) => !z.alive)) {
    const hits = f.hits.filter((h) => h.tag === zone.tag)
    const fired = Math.min(...hits.map((h) => Math.min(...h.at.keys())))
    for (let k = 0; k < zone.log.length; k++) {
      const shown = zone.log[k]
      const t = zone.born + k
      if (!shown || t < fired) continue
      if (shown.hi - shown.lo < (zone.to - zone.from) / 2) shrunk++
      for (let x = shown.lo + 1; x < shown.hi - 1 && !bad; x += 6) {
        let last = -Infinity
        for (const hit of hits) for (const [s, r] of hit.at) if (x >= r.lo - slack && x <= r.hi + slack) last = Math.max(last, s)
        // A part shown now is hit now or later, and one that was passed goes within GONE_MS.
        if (last < t) bad = `${kind}: x ${x} shown at step ${t}, last hit ${last}`
      }
    }
    // Nothing of the zone stays up long after the last hit in it.
    const lastHit = Math.max(...hits.flatMap((h) => [...h.at.keys()]))
    const end = zone.log.findIndex((v, k) => v === null && zone.born + k > fired)
    expect(((zone.born + end - lastHit) * STEP_MS)).toBeLessThanOrEqual(GONE_MS)
  }
  expect(bad).toBe('')
  expect(shrunk).toBeGreaterThan(0)
}

describe('a moving attack clears the zone behind its front', () => {
  it.each(['a', 'b', 'c', 'd'])('charge (seed %s)', (seed) => {
    // A step of travel is kept behind the body, the charge moves 560 units a second.
    checkFront('charge', seed, 2 + (560 * STEP_MS) / 1000)
  })

  it.each(['a', 'b', 'c', 'd'])('shockwave (seed %s)', (seed) => {
    checkFront('shockwave', seed, 2 + (250 * STEP_MS) / 1000)
  })
})

describe('a zone of several parts clears each part on its own', () => {
  it('shows a pillar until its hitbox ends, and all pillars end together', () => {
    const f = fight('pillars', 'a')
    for (let i = 0; i < STEPS; i++) f.step()
    const first = f.zones.find((z) => !z.safe)!.tag
    const pillars = f.zones.filter((z) => !z.safe && z.tag === first)
    expect(pillars.length).toBeGreaterThan(2)
    const lastHit = Math.max(...f.hits.filter((h) => h.tag === first).flatMap((h) => [...h.at.keys()]))
    for (const zone of pillars) {
      const gone = zone.born + zone.log.findIndex((v) => v === null)
      expect(gone).toBeGreaterThan(lastHit)
      expect((gone - lastHit) * STEP_MS).toBeLessThanOrEqual(GONE_MS)
    }
  })

  it('keeps a rain column until the last drop over it has landed', () => {
    const f = fight('rain', 'a')
    for (let i = 0; i < STEPS; i++) f.step()
    const band = f.zones.find((z) => !z.safe && z.to - z.from > 900)
    expect(band).toBeDefined()
    // The band narrows to the drops still in the air before it goes.
    expect(band!.log.some((v) => v && v.hi - v.lo < band!.to - band!.from - 50)).toBe(true)
  })
})
