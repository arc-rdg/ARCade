import { describe, expect, it } from 'vitest'
import type { PlayerBuild } from '../../../src/game/contracts/progression'
import {
  applyCard,
  applyCorrupted,
  canApply,
  CARDS,
  createBuild,
  PRICES,
  refineCard,
  removeCard,
  replacementsFor,
  swapCost,
  swapsAllowed,
  swateOptions,
} from '../../../src/game/model/progression'

const pick = (build: PlayerBuild, ...ids: string[]) => ids.reduce(applyCard, build)
const cardOf = (id: string) => CARDS.find((card) => card.id === id)

describe('swaps and costs', () => {
  it('gives one swap per boss slain and none before the first', () => {
    expect(swapsAllowed(0)).toBe(0)
    expect(swapsAllowed(1)).toBe(1)
    expect(swapsAllowed(4)).toBe(4)
  })

  it('costs twice what the FAIR trader asks, by rarity', () => {
    for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) expect(swapCost(rarity)).toBe(2 * PRICES[rarity])
    expect(swapCost('common')).toBe(10)
    expect(swapCost('legendary')).toBe(90)
  })
})

describe('what SWATE lists and offers', () => {
  const build = pick(createBuild(), 'weapon.wand', 'weapon.arcitect', 'stat.sharpened', 'stat.sharpened', 'mechanic.doubleJump', 'mechanic.centrifugeSpin', 'legendary.theOntology')
  const stacks = { 'stat.sharpened': 2 }

  it('lists stat stacks, mechanics, abilities and legendary augments, never a weapon', () => {
    const options = swateOptions(build, stacks, 999)
    expect(options.map((option) => option.card.id)).toEqual(['stat.sharpened', 'mechanic.doubleJump', 'mechanic.centrifugeSpin', 'legendary.theOntology'])
    expect(options[0].count).toBe(2)
    expect(options.some((option) => option.card.kind === 'weapon')).toBe(false)
  })

  it('leaves out corrupted augments, which are not cards', () => {
    const corrupted = applyCorrupted(build, 'bigData')
    expect(swateOptions(corrupted, stacks, 999).map((option) => option.card.id)).toEqual(swateOptions(build, stacks, 999).map((option) => option.card.id))
  })

  it('offers cards of the same rarity only, no weapons, no owned card that does not stack', () => {
    for (const option of swateOptions(build, stacks, 999)) {
      for (const card of option.replacements) {
        expect(card.rarity).toBe(option.card.rarity)
        expect(card.kind).not.toBe('weapon')
        expect(card.id).not.toBe(option.card.id)
      }
    }
    const uncommon = replacementsFor(build, 'mechanic.doubleJump').map((card) => card.id)
    // Held and not stacking: out. The swapped-out card itself is not its own replacement.
    expect(uncommon).not.toContain('mechanic.centrifugeSpin')
    expect(uncommon).not.toContain('mechanic.doubleJump')
    expect(uncommon).toContain('mechanic.airDash')
    // Uncommon weapons share the rarity and stay out.
    expect(uncommon).not.toContain('weapon.scalpel')
    const legendary = replacementsFor(build, 'legendary.theOntology').map((card) => card.id)
    expect(legendary).not.toContain('weapon.gitLfs')
    expect(legendary).toContain('legendary.gitRevert')
  })

  it('includes stat cards that stack, and not the card being swapped', () => {
    const common = replacementsFor(build, 'stat.sharpened').map((card) => card.id)
    expect(common).toContain('stat.swiftFeet')
    expect(common).not.toContain('stat.sharpened')
    const ownsSwift = pick(build, 'stat.swiftFeet')
    expect(replacementsFor(ownsSwift, 'stat.sharpened').map((card) => card.id)).toContain('stat.swiftFeet')
  })

  it('offers an ability card only when a slot is free', () => {
    const full = pick(createBuild(), 'mechanic.parry', 'mechanic.familiar', 'mechanic.centrifugeSpin', 'mechanic.fumeHood', 'mechanic.doubleJump')
    expect(full.abilitySlots.includes(null)).toBe(false)
    // A plain mechanic swapped out frees no slot, so no ability card fits.
    expect(replacementsFor(full, 'mechanic.doubleJump').map((card) => card.id)).not.toContain('mechanic.citationNeeded')
    // An ability swapped out does.
    expect(replacementsFor(full, 'mechanic.fumeHood').map((card) => card.id)).toContain('mechanic.citationNeeded')
  })

  it('marks what the fragments cannot cover', () => {
    expect(swateOptions(build, stacks, 3).every((option) => option.state === 'poor')).toBe(true)
    expect(swateOptions(build, stacks, 999).every((option) => option.state === 'ok')).toBe(true)
  })
})

describe('applying a swap', () => {
  const build = pick(createBuild(), 'stat.sharpened', 'stat.sharpened', 'mechanic.doubleJump', 'mechanic.centrifugeSpin', 'mechanic.fumeHood', 'legendary.theOntology')
  const stacks = { 'stat.sharpened': 2 }

  it('removes one stat stack and adds the new card like a purchase', () => {
    const result = refineCard(build, stacks, 25, 1, 'stat.sharpened', 'stat.swiftFeet')
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.cost).toBe(10)
    expect(result.fragments).toBe(15)
    expect(result.build.stats.damage).toBeCloseTo(build.stats.damage / 1.15)
    expect(result.build.stats.moveSpeed).toBeCloseTo(1.12)
    expect(result.build.level).toBe(build.level)
    expect(result.build.xp).toBe(build.xp)
    expect(result.build.hp).toBe(build.hp)
  })

  it('moves an ability into the slot the old one freed', () => {
    const slot = build.abilitySlots.indexOf('centrifugeSpin')
    expect(slot).toBeGreaterThanOrEqual(0)
    const result = refineCard(build, stacks, 25, 1, 'mechanic.centrifugeSpin', 'mechanic.citationNeeded')
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.build.mechanics).not.toContain('centrifugeSpin')
    expect(result.build.mechanics).toContain('citationNeeded')
    expect(result.build.abilitySlots[slot]).toBe('citationNeeded')
    expect(result.build.abilitySlots.filter((s) => s === 'citationNeeded')).toHaveLength(1)
    expect(result.build.abilitySlots.filter((s) => s !== null)).toHaveLength(build.abilitySlots.filter((s) => s !== null).length)
  })

  it('takes a plain mechanic out and puts an ability in the first free slot', () => {
    const result = refineCard(build, stacks, 25, 1, 'mechanic.doubleJump', 'mechanic.citationNeeded')
    expect(result?.build.mechanics).toContain('citationNeeded')
    expect(result?.build.mechanics).not.toContain('doubleJump')
    expect(result?.build.abilitySlots).toContain('citationNeeded')
  })

  it('swaps a legendary augment and frees or fills its slot', () => {
    const result = refineCard(build, stacks, 90, 1, 'legendary.theOntology', 'legendary.peerPressure')
    expect(result?.cost).toBe(90)
    expect(result?.build.legendaries).toEqual(['peerPressure'])
    expect(result?.build.abilitySlots).toContain('peerPressure')
    expect(result?.build.abilitySlots).not.toContain('theOntology')
    expect(removeCard(build, 'legendary.theOntology').legendaries).toEqual([])
  })

  it('refuses without swaps, without enough fragments, for a weapon, a card not held or another rarity', () => {
    expect(refineCard(build, stacks, 25, 0, 'stat.sharpened', 'stat.swiftFeet')).toBeNull()
    expect(refineCard(build, stacks, 9, 1, 'stat.sharpened', 'stat.swiftFeet')).toBeNull()
    const armed = pick(build, 'weapon.wand')
    expect(refineCard(armed, stacks, 99, 1, 'weapon.wand', 'weapon.scalpel')).toBeNull()
    expect(refineCard(armed, stacks, 99, 1, 'stat.sharpened', 'weapon.scalpel')).toBeNull()
    expect(refineCard(build, stacks, 99, 1, 'mechanic.airDash', 'mechanic.doubleJump')).toBeNull()
    expect(refineCard(build, stacks, 99, 1, 'stat.sharpened', 'mechanic.airDash')).toBeNull()
    expect(refineCard(build, stacks, 99, 1, 'stat.sharpened', 'stat.sharpened')).toBeNull()
  })

  it('applies every replacement it lists', () => {
    for (const option of swateOptions(build, stacks, 999)) {
      for (const card of option.replacements) {
        expect(refineCard(build, stacks, 999, 1, option.card.id, card.id)).not.toBeNull()
        expect(canApply(removeCard(build, option.card.id), card.id)).toBe(true)
        expect(cardOf(card.id)?.rarity).toBe(option.card.rarity)
      }
    }
  })
})
