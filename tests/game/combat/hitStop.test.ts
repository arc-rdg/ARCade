import { describe, expect, it } from 'vitest'
import { createHitStop } from '../../../src/game/phaser/combat/hitStop'

describe('hit-stop', () => {
  it('freezes for the longest hit and counts down', () => {
    const stop = createHitStop()
    stop.hit(30)
    stop.hit(70)
    stop.hit(20)
    expect(stop.remainingMs()).toBe(70)
    expect(stop.tick(40)).toBe(true)
    expect(stop.remainingMs()).toBe(30)
  })

  it('ends at once when a dash or jump is pressed', () => {
    for (const action of ['dash', 'jump']) {
      const stop = createHitStop()
      stop.hit(70)
      stop.interrupt(new Set([action]))
      expect(stop.remainingMs()).toBe(0)
      expect(stop.tick(8)).toBe(false)
    }
  })

  it('ignores other presses', () => {
    const stop = createHitStop()
    stop.hit(70)
    stop.interrupt(new Set(['light', 'heavy', 'left']))
    expect(stop.remainingMs()).toBe(70)
  })
})
