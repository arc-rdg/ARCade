import { describe, expect, it, vi } from 'vitest'
import { Rect } from './actorFakes'
import { ADD_CONTACT_SIZE, ADD_SIZE, ADD_WINDUP_MS, createAdds } from '../../../src/game/phaser/bosses/adds'
import { STEP_MS } from '../../../src/game/contracts/constants'

vi.mock('phaser', async () => ({ default: (await import('./actorFakes')).PhaserFake }))
vi.mock('../../../src/game/phaser/bosses/sprites', () => ({ applyRef: () => {} }))

class FakeSprite {
  visible = true
  alpha = 1
  scaleX = 1
  scaleY = 1
  x = 0
  y = 0
  key: string
  constructor(key: string) {
    this.key = key
  }
  setDepth() {
    return this
  }
  setVisible(v: boolean) {
    this.visible = v
    return this
  }
  setAlpha(a: number) {
    this.alpha = a
    return this
  }
  setScale(x: number, y = x) {
    this.scaleX = x
    this.scaleY = y
    return this
  }
  setPosition(x: number, y: number) {
    this.x = x
    this.y = y
    return this
  }
  setOrigin() {
    return this
  }
  setFlipX() {
    return this
  }
  setTint() {
    return this
  }
  setTintMode() {
    return this
  }
  clearTint() {
    return this
  }
  destroy() {}
}

const ref = (key: string) => ({ textureKey: key, animKey: key, width: 10, height: 10, anchors: { weapon: { x: 0, y: 0 }, head: { x: 0, y: 0 } } })

function setup() {
  const sprites: FakeSprite[] = []
  const scene = {
    add: {
      sprite: (_x: number, _y: number, key: string) => {
        const sprite = new FakeSprite(key)
        sprites.push(sprite)
        return sprite
      },
    },
  }
  const registered = new Set<unknown>()
  const hitboxes: { shape: { x: number; y: number; w: number; h: number }; owner: unknown }[] = []
  const combat = {
    register: (c: unknown) => registered.add(c),
    unregister: (c: unknown) => registered.delete(c),
    cancelOwnedBy() {},
    spawnHitbox: (spec: { shape: { x: number; y: number; w: number; h: number }; owner: unknown }) => hitboxes.push(spec),
  }
  const at = { x: 300, y: 0 }
  const box = new Rect()
  const player = {
    position: () => at,
    hurtbox: () => box.setTo(at.x - 10, -48, 20, 48),
    isDead: () => false,
  }
  const adds = createAdds({
    scene: scene as never,
    combat: combat as never,
    player: player as never,
    look: { body: ref('body'), crack: ref('crack'), ring: ref('ring'), chip: ref('chip'), spark: ref('spark') },
    floorY: 0,
    left: 0,
    right: 600,
    perch: { ledge: null } as never,
    killer: () => null,
  })
  const hurtOf = () => [...registered][0] as { hurtbox(): Rect; hp: number; receiveHit(h: unknown): number; position(): { x: number } }
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += STEP_MS) adds.update(STEP_MS)
  }
  const count = (key: string) => sprites.filter((s) => s.key === key)
  return { adds, sprites, registered, hitboxes, at, run, hurtOf, count }
}

const hit = (damage: number) => ({ damage })

describe('boss adds', () => {
  it('neither moves nor hurts for the first 450 ms, then touches', () => {
    const t = setup()
    t.at.x = 300
    t.adds.spawn(300, 6)
    const x = t.hurtOf().position().x
    t.run(ADD_WINDUP_MS - STEP_MS * 2)
    expect(t.hitboxes).toHaveLength(0)
    expect(t.hurtOf().position().x).toBe(x)
    t.run(STEP_MS * 4)
    expect(t.hitboxes.length).toBeGreaterThan(0)
  })

  it('walks at the player after the wind-up', () => {
    const t = setup()
    t.at.x = 500
    t.adds.spawn(100, 6)
    t.run(ADD_WINDUP_MS + 500)
    expect(t.hurtOf().position().x).toBeGreaterThan(100)
  })

  it('has a 32 hurtbox and a 28 touch box', () => {
    const t = setup()
    t.adds.spawn(300, 6)
    const hurt = t.hurtOf().hurtbox()
    expect([hurt.width, hurt.height]).toEqual([32, 32])
    expect(ADD_SIZE).toBe(32)
    t.run(ADD_WINDUP_MS + 100)
    const touch = t.hitboxes[0].shape
    expect([touch.w, touch.h]).toEqual([ADD_CONTACT_SIZE, ADD_CONTACT_SIZE])
    expect(ADD_CONTACT_SIZE).toBe(28)
  })

  it('shows the crack below half hp and not above', () => {
    const t = setup()
    t.adds.spawn(300, 6)
    t.run(ADD_WINDUP_MS + 100)
    const crack = t.count('crack')[0]
    expect(crack.visible).toBe(false)
    t.hurtOf().receiveHit(hit(10))
    t.run(STEP_MS)
    expect(crack.visible).toBe(false)
    t.hurtOf().receiveHit(hit(5))
    t.run(STEP_MS)
    expect(crack.visible).toBe(true)
  })

  it('clear during the wind-up leaves no ring or chip', () => {
    const t = setup()
    t.adds.spawn(300, 6)
    t.run(200)
    expect(t.count('ring').some((s) => s.visible)).toBe(true)
    expect(t.count('chip').some((s) => s.visible)).toBe(true)
    t.adds.clear()
    for (const s of [...t.count('ring'), ...t.count('chip'), ...t.count('spark'), ...t.count('crack'), ...t.count('body')]) expect(s.visible).toBe(false)
    expect(t.registered.size).toBe(0)
  })

  it('shows the ring and chip only during the wind-up', () => {
    const t = setup()
    t.adds.spawn(300, 6)
    t.run(ADD_WINDUP_MS + STEP_MS)
    expect(t.count('ring').some((s) => s.visible)).toBe(false)
    expect(t.count('chip').some((s) => s.visible)).toBe(false)
  })

  it('pops with sparks when killed and then frees the slot', () => {
    const t = setup()
    t.adds.spawn(300, 6)
    t.run(ADD_WINDUP_MS + 100)
    t.hurtOf().receiveHit(hit(100))
    t.run(STEP_MS * 3)
    expect(t.count('spark').filter((s) => s.visible).length).toBe(6)
    t.run(400)
    expect(t.count('spark').some((s) => s.visible)).toBe(false)
    expect(t.registered.size).toBe(0)
  })

  it('reuses its pooled objects over 100 spawns and kills', () => {
    const t = setup()
    const made = t.sprites.length
    for (let i = 0; i < 100; i++) {
      expect(t.adds.spawn(200 + (i % 5) * 40, 6)).toBe(true)
      t.run(ADD_WINDUP_MS + 50)
      t.hurtOf().receiveHit(hit(100))
      t.run(300)
    }
    expect(t.sprites.length).toBe(made)
    expect(t.count('ring')).toHaveLength(4)
    expect(t.count('spark')).toHaveLength(24)
  })

  it('refuses a fifth add', () => {
    const t = setup()
    for (let i = 0; i < 4; i++) expect(t.adds.spawn(300, 6)).toBe(true)
    expect(t.adds.spawn(300, 6)).toBe(false)
  })
})
