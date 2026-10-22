import { describe, expect, it } from 'vitest'
import type { CorruptedId, PlayerBuild } from '../../../src/game/contracts/progression'
import { createRng } from '../../../src/game/contracts/rng'
import {
  addXp,
  applyCard,
  applyCorrupted,
  canApply,
  CARDS,
  corruptedChoices,
  createBuild,
  eatCookie,
  recomputeStats,
  refineCard,
  removeAugment,
  replacementsFor,
  STAT_CAPS,
  statStacks,
  submitToDatenkrake,
} from '../../../src/game/model/progression'

const pick = (build: PlayerBuild, ...ids: string[]) => ids.reduce(applyCard, build)
const corrupt = (build: PlayerBuild, ...ids: CorruptedId[]) => ids.reduce(applyCorrupted, build)
const times = (n: number, id: string): string[] => Array(n).fill(id)

describe('stats replayed from the held cards', () => {
  it('match what taking the cards one at a time built up, over many random runs', () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(`replay-${seed}`)
      let build = createBuild()
      for (let step = 0; step < 60; step++) {
        const roll = rng.next()
        if (roll < 0.3) build = addXp(build, rng.int(1, 60)).build
        else if (roll < 0.85) {
          const usable = CARDS.filter((card) => canApply(build, card.id))
          if (usable.length > 0) build = applyCard(build, rng.pick(usable).id)
        } else if (roll < 0.93) {
          const choices = corruptedChoices(build)
          if (choices.length > 0) build = applyCorrupted(build, rng.pick(choices))
        } else build = eatCookie(build)
        const replayed = recomputeStats(build)
        expect(replayed.stats).toEqual(build.stats)
        expect(replayed.hp).toBe(build.hp)
        expect(replayed.offerSize).toBe(build.offerSize)
      }
    }
  })

  it('count every stat stack the build holds', () => {
    const build = pick(createBuild(), 'stat.sharpened', 'weapon.wand', 'stat.sharpened', 'stat.thickRobe', 'mechanic.doubleJump')
    expect(statStacks(build)).toEqual({ 'stat.sharpened': 2, 'stat.thickRobe': 1 })
    expect(statStacks(removeAugment(build, 'stat.sharpened'))).toEqual({ 'stat.sharpened': 1, 'stat.thickRobe': 1 })
  })
})

describe('removing a stat stack', () => {
  it('keeps a stat at its limit when the stacks left still reach it', () => {
    // Six Fast Track reach the limit, Data Lake slows the mage, four more reach the limit again.
    const build = pick(corrupt(pick(createBuild(), ...times(6, 'stat.swiftFeet')), 'dataLake'), ...times(4, 'stat.swiftFeet'))
    expect(build.stats.moveSpeed).toBe(STAT_CAPS.moveSpeed)
    const after = removeAugment(build, 'stat.swiftFeet')
    expect(after.stats.moveSpeed).toBe(STAT_CAPS.moveSpeed)
    expect(statStacks(after)['stat.swiftFeet']).toBe(9)
  })

  it('costs exactly what the card gave below the limit', () => {
    const build = pick(createBuild(), ...times(3, 'stat.sharpened'))
    expect(removeAugment(build, 'stat.sharpened').stats).toEqual(pick(createBuild(), ...times(2, 'stat.sharpened')).stats)
  })

  it('under Shadow IT gives the dash cooldown of the same run without that stack', () => {
    const build = corrupt(pick(createBuild(), 'stat.freshBattery', 'stat.freshBattery'), 'shadowIt')
    expect(build.stats.dashCooldownMs).toBe(2000)
    const exact = corrupt(pick(createBuild(), 'stat.freshBattery'), 'shadowIt')
    expect(removeAugment(build, 'stat.freshBattery').stats).toEqual(exact.stats)
    expect(exact.stats.dashCooldownMs).toBe(3000)
  })

  it('under Infinite Scroll gives the dash cooldown of the same run without that stack', () => {
    const build = corrupt(pick(createBuild(), 'stat.freshBattery', 'stat.freshBattery'), 'infiniteScroll')
    expect(build.stats.dashCooldownMs).toBe(250)
    expect(removeAugment(build, 'stat.freshBattery').stats.dashCooldownMs).toBe(375)
  })

  it('replays cards taken after a corrupted augment the way they were taken', () => {
    const build = pick(corrupt(createBuild(), 'shadowIt'), 'stat.freshBattery', 'stat.freshBattery')
    expect(build.stats.dashCooldownMs).toBe(3000)
    expect(removeAugment(build, 'stat.freshBattery').stats.dashCooldownMs).toBe(3500)
  })

  it('never heals and never kills: the hp stays, capped by the new max HP', () => {
    const full = pick(createBuild(), 'stat.thickRobe', 'stat.thickRobe')
    expect(full.hp).toBe(full.stats.maxHp)
    const robeLess = removeAugment(full, 'stat.thickRobe')
    expect(robeLess.stats.maxHp).toBe(115)
    expect(robeLess.hp).toBe(115)
    const hurt = removeAugment({ ...full, hp: 40 }, 'stat.thickRobe')
    expect(hurt.hp).toBe(40)
    expect(removeAugment({ ...pick(createBuild(), 'stat.freshBattery'), hp: 30 }, 'stat.freshBattery').hp).toBe(30)
  })

  it('leaves a build without that card as it is', () => {
    const build = pick(createBuild(), 'stat.sharpened')
    expect(removeAugment(build, 'stat.swiftFeet')).toBe(build)
  })
})

describe('the encounters that take a stat stack', () => {
  it('the Datenkrake takes a Rapid Release stack exactly, whatever it gives back', () => {
    const build = corrupt(pick(createBuild(), 'stat.freshBattery', 'stat.freshBattery'), 'shadowIt')
    for (let i = 0; i < 40; i++) {
      const deal = submitToDatenkrake(build, createRng(`exact-${i}`))
      if (!deal) throw new Error('no deal')
      expect(deal.taken).toBe('stat.freshBattery')
      const replay = corrupt(pick(createBuild(), 'stat.freshBattery'), 'shadowIt', deal.given)
      expect(deal.build.stats).toEqual(replay.stats)
    }
  })

  it('SWATE swaps a Rapid Release stack away exactly under Infinite Scroll', () => {
    const build = corrupt(pick(createBuild(), 'stat.freshBattery', 'stat.freshBattery'), 'infiniteScroll')
    expect(replacementsFor(build, 'stat.freshBattery').map((card) => card.id)).toContain('stat.sharpened')
    const result = refineCard(build, 99, 1, 'stat.freshBattery', 'stat.sharpened')
    expect(result?.build.stats.dashCooldownMs).toBe(375)
    expect(result?.build.stats.damage).toBeCloseTo(1.08)
    expect(result && statStacks(result.build)).toEqual({ 'stat.freshBattery': 1, 'stat.sharpened': 1 })
  })
})
