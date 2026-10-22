import { describe, expect, it } from 'vitest'
import { SWATE_HEIGHT, SWATE_LABEL } from '../../../src/game/phaser/art/swate'
import { createLabelState, LABEL_HIT_COOLDOWN_MS, LABEL_HITS, labelFight, labelStrike, labelZone } from '../../../src/game/phaser/scenes/swateLabel'

const STEP = LABEL_HIT_COOLDOWN_MS + 1

describe('hitting the label on SWATE', () => {
  it('peels on each counted hit and falls on the last', () => {
    const state = createLabelState()
    const results = Array.from({ length: LABEL_HITS }, (_, i) => state.hit(i * STEP))
    expect(results).toEqual([...Array(LABEL_HITS - 1).fill('peeled'), 'fell'])
    expect(state.fallen).toBe(true)
  })

  it('counts a multi-hit swing once', () => {
    const state = createLabelState()
    expect([state.hit(1000), state.hit(1020), state.hit(1100)]).toEqual(['peeled', 'ignored', 'ignored'])
    expect(state.hits).toBe(1)
    expect(state.hit(1000 + LABEL_HIT_COOLDOWN_MS)).toBe('peeled')
  })

  it('stays fallen however often it is hit afterwards', () => {
    const state = createLabelState()
    for (let i = 0; i < LABEL_HITS; i++) state.hit(i * STEP)
    expect(state.hit(100 * STEP)).toBe('ignored')
    expect(state.fallen).toBe(true)
  })

  it('starts with the label on for a new encounter', () => {
    const first = createLabelState()
    for (let i = 0; i < LABEL_HITS; i++) first.hit(i * STEP)
    const next = createLabelState()
    expect(next.fallen).toBe(false)
    expect(next.hits).toBe(0)
  })
})

describe('the hit zone of the label', () => {
  const x = 500
  const floor = 300
  const zone = labelZone(x, floor, { x: 0, y: 0, width: 0, height: 0 })
  const inside = (px: number, py: number) => px >= zone.x && px <= zone.x + zone.width && py >= zone.y && py <= zone.y + zone.height

  it('covers the label and a margin around it', () => {
    expect(inside(x + SWATE_LABEL.x + SWATE_LABEL.w / 2, floor + SWATE_LABEL.y + SWATE_LABEL.h / 2)).toBe(true)
    expect(inside(x + SWATE_LABEL.x - 8, floor + SWATE_LABEL.y - 8)).toBe(true)
    expect(zone.width).toBeGreaterThan(SWATE_LABEL.w)
    expect(zone.height).toBeGreaterThan(SWATE_LABEL.h)
  })

  it('leaves out the legs, the far side and the top of SWATE', () => {
    expect(inside(x - 18, floor - 10)).toBe(false)
    expect(inside(x - 40, floor + SWATE_LABEL.y)).toBe(false)
    expect(inside(x, floor - SWATE_HEIGHT + 10)).toBe(false)
  })

  it('does not reach below the floor', () => {
    expect(zone.y + zone.height).toBeLessThanOrEqual(floor)
  })
})

describe('the label during the trader fight', () => {
  const world = () => {
    const live = new Set<string>(['label'])
    return { live, register: (c: string) => live.add(c), unregister: (c: string) => live.delete(c) }
  }

  it('leaves the combat world while the fight runs and returns after it', () => {
    const combat = world()
    const state = createLabelState()
    labelFight(combat, 'label', state, true)
    expect(combat.live.has('label')).toBe(false)
    labelFight(combat, 'label', state, false)
    expect(combat.live.has('label')).toBe(true)
  })

  it('stays out after the fight once the label has fallen', () => {
    const combat = world()
    const state = createLabelState()
    for (let i = 0; i < LABEL_HITS; i++) state.hit(i * STEP)
    combat.unregister('label')
    labelFight(combat, 'label', state, true)
    labelFight(combat, 'label', state, false)
    expect(combat.live.has('label')).toBe(false)
  })
})

describe('who counts on the label', () => {
  it('counts the player and ignores stand-ins', () => {
    const player = {}
    const state = createLabelState()
    expect(labelStrike(state, {}, player, 0)).toBe('ignored')
    expect(labelStrike(state, player, player, STEP)).toBe('peeled')
    expect(state.hits).toBe(1)
  })
})
