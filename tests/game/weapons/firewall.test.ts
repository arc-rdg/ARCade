import { describe, expect, it, vi } from 'vitest'
import { TILE } from '../../../src/game/contracts/constants'
import { createAutoclave } from '../../../src/game/phaser/player/weapons/abilities'
import type { Core } from '../../../src/game/phaser/player/weapons/core'

// A graphics object that only records what the feature does to it.
function fakeGraphics() {
  const g = {
    visible: false,
    x: 0,
    y: 0,
    scale: 1,
    alpha: 1,
    destroyed: false,
    setDepth: () => g,
    setVisible: (v: boolean) => ((g.visible = v), g),
    setPosition: (x: number, y: number) => ((g.x = x), (g.y = y), g),
    setScale: (s: number) => ((g.scale = s), g),
    setAlpha: (a: number) => ((g.alpha = a), g),
    fillStyle: () => g,
    lineStyle: () => g,
    fillEllipse: () => g,
    strokeEllipse: () => g,
    strokeCircle: () => g,
    fillTriangle: () => g,
    destroy: () => (g.destroyed = true),
  }
  return g
}

function enemy(x: number, dead = false) {
  return {
    isDead: () => dead,
    isInvulnerable: () => false,
    hurtbox: () => ({ x: x - 8, y: -8, width: 16, height: 16 }),
  }
}

function setup(multiplier = 1) {
  const made: ReturnType<typeof fakeGraphics>[] = []
  const blocks: number[] = []
  const boxes: { damage: number; tags: string[]; cx: number }[] = []
  const disposers: (() => void)[] = []
  const mages = [enemy(0)]
  const player = {
    position: () => ({ x: 0, y: 22 }),
    blockHits: (ms: number) => blocks.push(ms),
    isDead: () => false,
    gameObject: { x: 0, y: 22 },
  }
  const core = {
    deps: {
      scene: { add: { graphics: () => (made.push(fakeGraphics()), made[made.length - 1]) } },
      player,
      enemies: () => mages,
    },
    flags: { autoclave: true },
    damage: { multiplier },
    extra: { box: (b: { damage: number; tags: string[]; cx: number }) => boxes.push(b) },
    fx: { burst: vi.fn() },
    own: (d: () => void) => disposers.push(d),
  } as unknown as Core
  mages.length = 0
  return { core, made, blocks, boxes, mages, disposers, feature: createAutoclave(core) }
}

describe('Firewall', () => {
  it('blocks hits for 0.9 s and recharges in 14 s', () => {
    const { feature, blocks } = setup()
    expect(feature.handler.cooldownMs).toBe(14000)
    feature.handler.activate({ held: new Set() } as never)
    expect(blocks).toEqual([900])
  })

  it('hits living enemies within 3 tiles for 20, scaled by the damage multiplier', () => {
    const { feature, boxes, mages } = setup(1.5)
    mages.push(enemy(40), enemy(3 * TILE + 8), enemy(3 * TILE + 20), enemy(10, true))
    feature.handler.activate({ held: new Set() } as never)
    expect(boxes.map((b) => b.cx)).toEqual([40, 3 * TILE + 8])
    for (const b of boxes) {
      expect(b.damage).toBeCloseTo(30)
      expect(b.tags).toContain('heavy')
    }
  })

  it('shows the aura and the ring on cast and hides them when the block ends', () => {
    const { feature, made, disposers } = setup()
    expect(made).toHaveLength(0)
    feature.handler.activate({ held: new Set() } as never)
    expect(made).toHaveLength(2)
    expect(made.every((g) => g.visible)).toBe(true)
    feature.update?.(450)
    feature.render?.()
    expect(made[0].visible).toBe(true)
    expect(made[0].y).toBe(0)
    // The ring has grown to its full size and is gone by now.
    expect(made[1].visible).toBe(false)
    feature.update?.(449)
    expect(made[0].visible).toBe(true)
    feature.update?.(2)
    expect(made.every((g) => !g.visible)).toBe(true)
    // A second cast reuses the same two objects.
    feature.handler.activate({ held: new Set() } as never)
    expect(made).toHaveLength(2)
    disposers.forEach((d) => d())
    expect(made.every((g) => g.destroyed)).toBe(true)
  })

  it('hides the aura when the card is removed', () => {
    const { feature, made, core } = setup()
    feature.handler.activate({ held: new Set() } as never)
    ;(core.flags as Record<string, boolean>).autoclave = false
    feature.sync(core.build)
    expect(made.every((g) => !g.visible)).toBe(true)
  })
})
