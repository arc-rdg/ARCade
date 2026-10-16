import type { LegendaryId, PlayerBuild, PowerUpCard, Rarity } from '../../contracts/progression'
import { canApply, applyCard } from './build'
import { ABILITY_IDS, CARDS } from './catalog'
import { removeAugment } from './datenkrake'
import { PRICES } from './store'

// SWATE (deprecated), a chance encounter of the waystation. It swaps one augment for another of the
// same rarity, for Ontology Fragments. An augment is every card that is not a weapon: stat cards
// (one stack at a time), mechanics, ability cards and legendary augments. Weapons stay out, and so
// do the corrupted augments of the Datenkrake: they are not in the card catalog and SWATE cannot
// read them.

// One swap per node boss beaten, so the later the mage meets it the more it can refine.
export const SWAPS_PER_BOSS = 1

// A swap costs this many times what the FAIR trader asks for a card of that rarity.
export const SWAP_COST_FACTOR = 2

export function swapsAllowed(bossesSlain: number): number {
  return Math.max(0, Math.floor(bossesSlain)) * SWAPS_PER_BOSS
}

export function swapCost(rarity: Rarity): number {
  return SWAP_COST_FACTOR * PRICES[rarity]
}

// The build without one copy of `cardId`. Stat cards and mechanics go like the Datenkrake takes
// them (a stat at its limit comes out slightly low); a legendary augment also leaves its slot.
export function removeCard(build: PlayerBuild, cardId: string): PlayerBuild {
  if (!cardId.startsWith('legendary.')) return removeAugment(build, cardId)
  const id = cardId.slice('legendary.'.length) as LegendaryId
  if (!build.legendaries.includes(id)) return build
  return { ...build, legendaries: build.legendaries.filter((owned) => owned !== id), abilitySlots: build.abilitySlots.map((slot) => (slot === id ? null : slot)) }
}

const isAbilityCard = (cardId: string): boolean => (ABILITY_IDS as readonly string[]).includes(cardId.slice(cardId.indexOf('.') + 1)) && !cardId.startsWith('stat.')

// How many copies of `card` the mage holds. `statStacks` counts the stat cards (the level history
// knows them, the build only has their sum).
function copies(build: PlayerBuild, statStacks: Readonly<Record<string, number>>, card: PowerUpCard): number {
  if (card.kind === 'stat') return statStacks[card.id] ?? 0
  if (card.kind === 'mechanic') return build.mechanics.includes(card.id.slice('mechanic.'.length) as never) ? 1 : 0
  if (card.kind === 'legendary') return build.legendaries.includes(card.id.slice('legendary.'.length) as LegendaryId) ? 1 : 0
  return 0
}

// The cards that could take the place of `cardId`: every other augment of the same rarity that the
// build can take once the old one is gone. That leaves out the augments it holds and cannot stack,
// ability cards without a free slot and cards a corrupted augment or a stat limit makes useless.
// Stat cards that stack stay in.
export function replacementsFor(build: PlayerBuild, cardId: string): PowerUpCard[] {
  const card = CARDS.find((entry) => entry.id === cardId)
  if (!card || card.kind === 'weapon') return []
  const without = removeCard(build, cardId)
  return CARDS.filter((entry) => entry.kind !== 'weapon' && entry.rarity === card.rarity && entry.id !== cardId && canApply(without, entry.id))
}

export type SwapState = 'ok' | 'nothing' | 'poor'

export interface SwateOption {
  card: PowerUpCard
  // The stacks of a stat card, 1 for the rest.
  count: number
  cost: number
  replacements: PowerUpCard[]
  state: SwapState
}

// The augments the mage can give up, in catalog order, with what each swap would cost and whether
// it can happen now. 'nothing' means no card of that rarity is left to swap in, 'poor' that the
// fragments do not cover the cost.
export function swateOptions(build: PlayerBuild, statStacks: Readonly<Record<string, number>>, fragments: number): SwateOption[] {
  const options: SwateOption[] = []
  for (const card of CARDS) {
    const count = copies(build, statStacks, card)
    if (count === 0) continue
    const replacements = replacementsFor(build, card.id)
    const cost = swapCost(card.rarity)
    options.push({ card, count, cost, replacements, state: replacements.length === 0 ? 'nothing' : fragments < cost ? 'poor' : 'ok' })
  }
  return options
}

export interface Refined {
  build: PlayerBuild
  fragments: number
  cost: number
  from: PowerUpCard
  to: PowerUpCard
}

// Swaps `fromId` for `toId`: the old card goes like a removal, the new one comes like a purchase
// (no level, no XP, no heal beyond what the card itself gives). A new ability card takes the slot
// the old one freed. Null when the swap cannot happen: no swaps left, the card is not held, the
// replacement is not one of its replacements, or the fragments do not cover the cost.
export function refineCard(
  build: PlayerBuild,
  statStacks: Readonly<Record<string, number>>,
  fragments: number,
  swapsLeft: number,
  fromId: string,
  toId: string,
): Refined | null {
  const from = CARDS.find((entry) => entry.id === fromId)
  const to = CARDS.find((entry) => entry.id === toId)
  if (!from || !to || swapsLeft <= 0 || copies(build, statStacks, from) === 0) return null
  const cost = swapCost(from.rarity)
  if (fragments < cost || !replacementsFor(build, fromId).some((entry) => entry.id === toId)) return null
  const freed = isAbilityCard(fromId) ? build.abilitySlots.indexOf(fromId.slice(fromId.indexOf('.') + 1) as never) : -1
  let next = applyCard(removeCard(build, fromId), toId)
  if (freed >= 0 && isAbilityCard(toId)) {
    const id = toId.slice(toId.indexOf('.') + 1)
    next = { ...next, abilitySlots: next.abilitySlots.map((slot, i) => (i === freed ? (id as never) : slot === id ? null : slot)) }
  }
  return { build: next, fragments: fragments - cost, cost, from, to }
}

export type SwateMood = 'arrive' | 'open' | 'swapped' | 'poor' | 'nothing' | 'spent' | 'bye'

// SWATE has been renamed and keeps mentioning it. Lines stay short enough for a speech bubble and
// never say when the rename happened, so they stay true.
export const SWATE_LINES: Record<SwateMood, readonly string[]> = {
  arrive: [
    'I was just renamed. Please update your bookmarks: ARCitISA.',
    'SWATE (deprecated). Same table, new name.',
    'Your annotations have loose terms. Come closer.',
    'Need a column fixed? I still have the term search.',
  ],
  open: [
    'Refine your data annotations.',
    'Pick a card. I will find it a better term.',
    'Characteristic, Parameter, Component. Which one is wrong?',
  ],
  swapped: [
    'Done. The new term maps to an ontology, I checked.',
    'Replaced and re-annotated. Please do not ask for an undo.',
    'Refined. The old value is deprecated, like me.',
    'Swapped. Do not forget to save your table.',
  ],
  poor: [
    'Not enough fragments. I cannot autofill money.',
    'Refinement is not free. It never was.',
    'The term search found nothing in your wallet.',
  ],
  nothing: [
    'No better term of that rarity. It is already well annotated.',
    'Nothing to swap in. The ontology has no match.',
  ],
  spent: [
    'That is all the refinements this stop allows. Please see the new version.',
    'No swaps left. Each boss earns you one.',
  ],
  bye: [
    'Remember to update your bookmarks.',
    'Close the table. Unsaved changes are deprecated.',
    'Goodbye. Please do not look for me under SWATE.',
  ],
}
