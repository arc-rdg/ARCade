import type {
  AddXp,
  ApplyCard,
  CorruptedId,
  CreateBuild,
  LegendaryId,
  MechanicId,
  PlayerBuild,
  PlayerStats,
  PlayerWeaponId,
  WeaponSlot,
  XpForNextLevel,
} from '../../contracts/progression'
import { ABILITY_IDS } from './catalog'
import { COOKIE_ENTRY, cookieStats, corruptedStats } from './corrupted'
import { weaponStats } from './weaponStats'

// dashCooldownMs is a floor. Fresh battery stops applying once the cooldown reaches it.
export const STAT_CAPS = {
  moveSpeed: 1.8,
  attackSpeed: 2.5,
  damage: 4,
  meleeRange: 1.8,
  critChance: 0.6,
  dashCooldownMs: 1000,
} as const

interface Effect {
  applies: (build: PlayerBuild) => boolean
  apply: (build: PlayerBuild) => PlayerBuild
}

type CappedStat = 'moveSpeed' | 'attackSpeed' | 'damage' | 'meleeRange' | 'critChance'
type WeaponState = PlayerBuild['weapons'][WeaponSlot]
// One entry of the stat log applied to the stats. A step that changes nothing returns `stats` itself.
type StatStep = (stats: PlayerStats) => PlayerStats

// The stat log entry of one level gained.
const LEVEL_ENTRY = 'level'
const LIFESTEAL = 0.08
const EXTRA_CHOICE_OFFER = 4

export const createBuild: CreateBuild = () => ({
  level: 1,
  xp: 0,
  hp: 100,
  stats: {
    maxHp: 100,
    moveSpeed: 1,
    attackSpeed: 1,
    damage: 1,
    meleeRange: 1,
    critChance: 0.05,
    critMultiplier: 1.5,
    dashCooldownMs: 2000,
    lifesteal: 0,
  },
  weapons: {
    light: { id: 'staff', tier: 1 },
    heavy: { id: 'staff', tier: 1 },
  },
  mechanics: [],
  legendaries: [],
  abilitySlots: [null, null, null, null],
  offerSize: 3,
  corrupted: [],
  statLog: [],
})

export const xpForNextLevel: XpForNextLevel = (level) => 20 + 10 * (level - 1)

const levelStats: StatStep = (stats) => ({ ...stats, maxHp: Math.round(stats.maxHp * 1.1) })

export const addXp: AddXp = (build, amount) => {
  let { level, hp, xp, stats } = build
  const statLog = [...build.statLog]
  let levelsGained = 0
  xp += amount
  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level)
    level += 1
    levelsGained += 1
    stats = levelStats(stats)
    statLog.push(LEVEL_ENTRY)
    hp = Math.min(stats.maxHp, hp + Math.round(0.3 * stats.maxHp))
    // Terms of Service: every level-up heals to full (and makes the mage read the EULA afterwards).
    if (build.corrupted.includes('termsOfService')) hp = stats.maxHp
  }
  return {
    build: { ...build, level, xp, hp, stats, statLog },
    levelsGained,
  }
}

// One stack of a capped stat card. At the limit it changes nothing.
function raise(field: CappedStat, update: (value: number) => number): StatStep {
  return (stats) => (stats[field] < STAT_CAPS[field] ? { ...stats, [field]: Math.min(STAT_CAPS[field], update(stats[field])) } : stats)
}

// Melee range scales melee hitboxes only, so a build with two shooting weapons gains nothing from it.
const hasMeleeWeapon = (build: PlayerBuild): boolean =>
  (['light', 'heavy'] as const).some((slot) => weaponStats(build.weapons[slot].id, slot, build.weapons[slot].tier).reach !== 'ranged')

// Each Fresh Battery card takes this much off the dash cooldown, so two cards reach the floor.
const FRESH_BATTERY_MS = 500

const freshBattery: StatStep = (stats) =>
  stats.dashCooldownMs > STAT_CAPS.dashCooldownMs ? { ...stats, dashCooldownMs: Math.max(STAT_CAPS.dashCooldownMs, stats.dashCooldownMs - FRESH_BATTERY_MS) } : stats

const thickRobe: StatStep = (stats) => ({ ...stats, maxHp: Math.round(stats.maxHp * 1.15) })

interface StatCard {
  field: keyof PlayerStats
  step: StatStep
  // Melee range is of no use to a build without a melee weapon.
  usable?: (build: PlayerBuild) => boolean
}

// What one stack of each stat card does. The cards go into the stat log, so the stats can be
// replayed without one of them.
const STAT_CARDS = new Map<string, StatCard>([
  ['stat.swiftFeet', { field: 'moveSpeed', step: raise('moveSpeed', (value) => value * 1.12) }],
  ['stat.quickHands', { field: 'attackSpeed', step: raise('attackSpeed', (value) => value * 1.12) }],
  ['stat.sharpened', { field: 'damage', step: raise('damage', (value) => value * 1.15) }],
  ['stat.keenEye', { field: 'critChance', step: raise('critChance', (value) => value + 0.05) }],
  ['stat.freshBattery', { field: 'dashCooldownMs', step: freshBattery }],
  ['stat.thickRobe', { field: 'maxHp', step: thickRobe }],
  ['stat.longReach', { field: 'meleeRange', step: raise('meleeRange', (value) => value * 1.15), usable: hasMeleeWeapon }],
])

// A stat card applies while one more stack changes its stat. Thick Robe heals the max HP it adds,
// so a build at full health stays at full health. The other cards leave the hp alone.
function statCard(id: string, { step, usable }: StatCard): Effect {
  return {
    applies: (build) => step(build.stats) !== build.stats && (usable?.(build) ?? true),
    apply: (build) => {
      const stats = step(build.stats)
      return { ...build, hp: build.hp + stats.maxHp - build.stats.maxHp, stats, statLog: [...build.statLog, id] }
    },
  }
}

function weapon(slot: WeaponSlot, id: PlayerWeaponId): Effect {
  return {
    applies: (build) => !(build.weapons[slot].id === id && build.weapons[slot].tier === 2),
    apply: (build) => {
      const next: WeaponState = build.weapons[slot].id === id ? { id, tier: 2 } : { id, tier: 1 }
      return { ...build, weapons: { ...build.weapons, [slot]: next } }
    },
  }
}

// A legendary weapon comes at full power, so it lands at tier 2 and is never offered again while
// it is held.
function legendaryWeapon(slot: WeaponSlot, id: PlayerWeaponId): Effect {
  return {
    applies: (build) => build.weapons[slot].id !== id,
    apply: (build) => ({ ...build, weapons: { ...build.weapons, [slot]: { id, tier: 2 } } }),
  }
}

function placeAbility(
  slots: PlayerBuild['abilitySlots'],
  id: MechanicId | LegendaryId,
): PlayerBuild['abilitySlots'] {
  return slots.with(slots.indexOf(null), id)
}

function mechanic(id: MechanicId, change: (build: PlayerBuild) => PlayerBuild = (build) => build): Effect {
  const isAbility = ABILITY_IDS.includes(id)
  return {
    applies: (build) => !build.mechanics.includes(id) && (!isAbility || build.abilitySlots.includes(null)),
    apply: (build) => {
      const changed = change(build)
      return {
        ...changed,
        mechanics: [...changed.mechanics, id],
        abilitySlots: isAbility ? placeAbility(changed.abilitySlots, id) : changed.abilitySlots,
      }
    },
  }
}

function legendary(id: LegendaryId): Effect {
  const isAbility = ABILITY_IDS.includes(id)
  return {
    applies: (build) => !build.legendaries.includes(id) && (!isAbility || build.abilitySlots.includes(null)),
    apply: (build) => ({
      ...build,
      legendaries: [...build.legendaries, id],
      abilitySlots: isAbility ? placeAbility(build.abilitySlots, id) : build.abilitySlots,
    }),
  }
}

const EFFECTS = new Map<string, Effect>([
  ...[...STAT_CARDS].map(([id, card]): [string, Effect] => [id, statCard(id, card)]),
  ['weapon.wand', weapon('light', 'wand')],
  ['weapon.pipettePistol', weapon('light', 'pipettePistol')],
  ['weapon.scalpel', weapon('light', 'scalpel')],
  ['weapon.sequenceWhip', weapon('light', 'sequenceWhip')],
  ['weapon.centrifugeDisc', weapon('heavy', 'centrifugeDisc')],
  ['weapon.beakerHammer', weapon('heavy', 'beakerHammer')],
  ['weapon.bunsenStaff', weapon('heavy', 'bunsenStaff')],
  ['weapon.petriShield', weapon('heavy', 'petriShield')],
  ['weapon.arcitect', legendaryWeapon('light', 'arcitect')],
  ['weapon.arcCommander', legendaryWeapon('light', 'arcCommander')],
  ['weapon.gitLfs', legendaryWeapon('heavy', 'gitLfs')],
  ['weapon.publicationPress', legendaryWeapon('heavy', 'publicationPress')],
  ['mechanic.doubleJump', mechanic('doubleJump')],
  ['mechanic.airDash', mechanic('airDash')],
  ['mechanic.wallJump', mechanic('wallJump')],
  ['mechanic.tripleCombo', mechanic('tripleCombo')],
  ['mechanic.groundSlam', mechanic('groundSlam')],
  ['mechanic.parry', mechanic('parry')],
  ['mechanic.hatGlide', mechanic('hatGlide')],
  ['mechanic.lifesteal', mechanic('lifesteal', (build) => ({ ...build, stats: { ...build.stats, lifesteal: LIFESTEAL } }))],
  ['mechanic.reflectDash', mechanic('reflectDash')],
  ['mechanic.echoStrike', mechanic('echoStrike')],
  ['mechanic.shockwaveHeavy', mechanic('shockwaveHeavy')],
  ['mechanic.familiar', mechanic('familiar')],
  ['mechanic.extraChoice', mechanic('extraChoice', (build) => ({ ...build, offerSize: EXTRA_CHOICE_OFFER }))],
  ['mechanic.serialDilution', mechanic('serialDilution')],
  ['mechanic.centrifugeSpin', mechanic('centrifugeSpin')],
  ['mechanic.fumeHood', mechanic('fumeHood')],
  ['mechanic.sampleFreeze', mechanic('sampleFreeze')],
  ['mechanic.citationNeeded', mechanic('citationNeeded')],
  ['mechanic.autoclave', mechanic('autoclave')],
  ['mechanic.secondWind', mechanic('secondWind')],
  ['legendary.theOntology', legendary('theOntology')],
  ['legendary.gitRevert', legendary('gitRevert')],
  ['legendary.doiExcalibur', legendary('doiExcalibur')],
  ['legendary.fairPrinciples', legendary('fairPrinciples')],
  ['legendary.peerReview', legendary('peerReview')],
  ['legendary.peerPressure', legendary('peerPressure')],
  ['legendary.labCoat', legendary('labCoat')],
])

// Cards a corrupted augment makes useless are not offered: no jump means no extra jumps or glide,
// and Rogue Admin crits every hit already.
const BLOCKED_BY: Partial<Record<CorruptedId, readonly string[]>> = {
  deprecatedJump: ['mechanic.doubleJump', 'mechanic.wallJump', 'mechanic.hatGlide'],
  rogueAdmin: ['stat.keenEye'],
}

const blocked = (build: PlayerBuild, cardId: string): boolean => build.corrupted.some((id) => BLOCKED_BY[id]?.includes(cardId) ?? false)

export const canApply = (build: PlayerBuild, cardId: string): boolean => {
  const effect = EFFECTS.get(cardId)
  return effect !== undefined && effect.applies(build) && !blocked(build, cardId)
}

export const applyCard: ApplyCard = (build, cardId) => {
  const effect = EFFECTS.get(cardId)
  if (!effect) throw new Error(`Unknown power-up card: ${cardId}`)
  return effect.applies(build) ? effect.apply(build) : build
}

function statStep(entry: string): StatStep {
  const card = STAT_CARDS.get(entry)
  if (card) return card.step
  if (entry === LEVEL_ENTRY) return levelStats
  if (entry === COOKIE_ENTRY) return cookieStats
  if (entry.startsWith('corrupted.')) return (stats) => corruptedStats(stats, entry.slice('corrupted.'.length) as CorruptedId)
  throw new Error(`Unknown stat log entry: ${entry}`)
}

// The stats of a build: the base stats with every log entry applied in order, each card capped as
// it was when taken, then what the mechanics set. Adding a card, a level, a corrupted augment or a
// cookie runs the same steps one at a time, so replaying an unchanged log gives the same numbers.
function replayStats(statLog: readonly string[], mechanics: readonly MechanicId[]): PlayerStats {
  let stats = createBuild().stats
  for (const entry of statLog) stats = statStep(entry)(stats)
  return { ...stats, lifesteal: mechanics.includes('lifesteal') ? LIFESTEAL : stats.lifesteal }
}

// The build with its stats replayed after something was taken out. The hp stays where it was,
// capped by the new max HP: a removal never heals and never kills.
export function recomputeStats(build: PlayerBuild): PlayerBuild {
  const stats = replayStats(build.statLog, build.mechanics)
  const offerSize = build.mechanics.includes('extraChoice') ? EXTRA_CHOICE_OFFER : createBuild().offerSize
  return { ...build, stats, hp: Math.min(build.hp, stats.maxHp), offerSize }
}

// How far `a` is ahead of `b` for the player: a lower dash cooldown is better, every other stat higher.
const ahead = (field: keyof PlayerStats, a: PlayerStats, b: PlayerStats): number =>
  field === 'dashCooldownMs' ? b[field] - a[field] : a[field] - b[field]

// The build without one stack of the stat card `cardId`, replayed as if that stack was never taken.
// With a corrupted augment between the stacks, which stack goes can matter: a stack taken before
// Data Lake may be worth nothing once the cards after it reached the limit again. So the stack
// whose loss costs least goes, the latest one when they cost the same. Unchanged without a stack.
export function removeStatStack(build: PlayerBuild, cardId: string): PlayerBuild {
  const card = STAT_CARDS.get(cardId)
  if (!card) return build
  let best: PlayerBuild | null = null
  for (let i = build.statLog.length - 1; i >= 0; i--) {
    if (build.statLog[i] !== cardId) continue
    const without = recomputeStats({ ...build, statLog: build.statLog.toSpliced(i, 1) })
    if (!best || ahead(card.field, without.stats, best.stats) > 0) best = without
  }
  return best ?? build
}

// How many stacks of each stat card the build holds, by card id.
export function statStacks(build: PlayerBuild): Record<string, number> {
  const stacks: Record<string, number> = {}
  for (const entry of build.statLog) if (STAT_CARDS.has(entry)) stacks[entry] = (stacks[entry] ?? 0) + 1
  return stacks
}
