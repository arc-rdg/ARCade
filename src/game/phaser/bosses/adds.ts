import Phaser from 'phaser'
import type { SpriteRef } from '../../contracts/art'
import type { Combatant, CombatWorld, HitEvent, KillerInfo, StatusEffect } from '../../contracts/combat'
import { DEPTH } from '../../contracts/constants'
import type { PlayerHandle } from '../../contracts/player'
import { addStatus, clearStatus, createStatus, statusTimeScale, tickStatus } from '../combat/status'
import type { StatusState } from '../combat/status'
import { addCrouching, createAddMotion, stepAdd } from './reach'
import type { AddMotion, PerchWatch } from './reach'
import { applyRef } from './sprites'
import { clamp } from './zones'

export interface Adds {
  // Returns false when every add slot is in use.
  spawn(x: number, damage: number): boolean
  update(dtMs: number): void
  // Removes every add without a kill event, for a phase change or the boss going down.
  clear(): void
  destroy(): void
}

export interface AddsLook {
  body: SpriteRef
  crack: SpriteRef
  ring: SpriteRef
  chip: SpriteRef
  spark: SpriteRef
}

export interface AddsDeps {
  scene: Phaser.Scene
  combat: CombatWorld
  player: PlayerHandle
  // The minion art: the body drawn at SIZE, the crack laid over it, and the pieces of the spawn
  // and death effects.
  look: AddsLook
  floorY: number
  left: number
  right: number
  // Where the player stands. The adds hop up to the platform in it.
  perch: PerchWatch
  // Reads the boss killer on demand, because the final boss changes it per phase.
  killer(): KillerInfo | null
}

const MAX_ADDS = 4
// The sprite and the hurtbox are SIZE square, the touch box is CONTACT_SIZE, centred in it.
export const ADD_SIZE = 32
export const ADD_CONTACT_SIZE = 28
// A new add grows in, shows a ring and a "!" and can neither move nor hurt for this long.
export const ADD_WINDUP_MS = 450
const SIZE = ADD_SIZE
const HP = 24
// The squash of a crouching add, before it hops.
const CROUCH_SQUASH = { x: 1.18, y: 0.78 }
const CONTACT_COOLDOWN_MS = 800
const WINDUP_FROM = { scale: 0.4, alpha: 0.5 }
const RING_FROM = 20
const RING_TO = 44
const DEATH_RING_FROM = 28
const DEATH_RING_TO = 56
const SPARKS = 6
const SPARK_SPEED = 80
const HIT_SQUASH = 1.2
const HIT_SQUASH_MS = 80
const PULSE = 0.1
const PULSE_HZ = 4
const CONTACT_ACTIVE_MS = 90
const FLASH_MS = 70
const DYING_MS = 220
const TAU = Math.PI * 2
const FROZEN_TINT = 0x8fd0ff

interface Slot extends Combatant {
  alive: boolean
  hp: number
  // Position and hop state, see stepAdd.
  motion: AddMotion
  face: 1 | -1
  damage: number
  contactMs: number
  flashMs: number
  dyingMs: number
  windMs: number
  squashMs: number
  // Time since the spawn, for the pulse.
  ageMs: number
  // Freezes and slows. A frozen add stands still and does not hurt on contact.
  status: StatusState
  sprite: Phaser.GameObjects.Sprite
  crack: Phaser.GameObjects.Sprite
  ring: Phaser.GameObjects.Sprite
  chip: Phaser.GameObjects.Sprite
  sparks: Spark[]
}

interface Spark {
  sprite: Phaser.GameObjects.Sprite
  // Where it flies, in units per ms.
  vx: number
  vy: number
}

// Spiky minions that run at the player and hurt on contact. A player up on a platform does not
// escape them for long: they crouch beside it and hop up, at a quarter of the player's speed (see
// stepAdd). They are Combatants of the boss team and name the boss as the killer. A fixed set of
// slots is reused, so a summon never creates objects. A new minion grows in over ADD_WINDUP_MS
// with a ring and a "!", and does not move or hurt until then. A hit squashes it, below half hp it
// shows cracks, and it dies in a burst of sparks. It drops nothing.
export function createAdds(deps: AddsDeps): Adds {
  const { scene, combat, player, floorY } = deps
  const box = new Phaser.Geom.Rectangle()
  const spot = { x: 0, y: floorY }
  const bounds = { left: deps.left, right: deps.right, floorY }

  function makeSlot(index: number): Slot {
    const { look } = deps
    const sprite = scene.add.sprite(0, floorY, look.body.textureKey).setDepth(DEPTH.enemies).setVisible(false)
    applyRef(sprite, { ...look.body, width: SIZE, height: SIZE })
    const crack = scene.add.sprite(0, floorY, look.crack.textureKey).setDepth(DEPTH.enemies + 1).setVisible(false)
    applyRef(crack, { ...look.crack, width: SIZE, height: SIZE })
    const ring = scene.add.sprite(0, floorY, look.ring.textureKey).setDepth(DEPTH.enemies + 1).setVisible(false)
    applyRef(ring, look.ring)
    ring.setOrigin(0.5, 0.5)
    const chip = scene.add.sprite(0, floorY, look.chip.textureKey).setDepth(DEPTH.enemies + 2).setVisible(false)
    applyRef(chip, look.chip)
    const sparks: Spark[] = Array.from({ length: SPARKS }, (_, i) => {
      const spark = scene.add.sprite(0, floorY, look.spark.textureKey).setDepth(DEPTH.enemies + 1).setVisible(false)
      applyRef(spark, look.spark)
      spark.setOrigin(0.5, 0.5)
      const angle = ((i + (index % 2) * 0.5) / SPARKS) * TAU
      return { sprite: spark, vx: (Math.cos(angle) * SPARK_SPEED) / 1000, vy: (Math.sin(angle) * SPARK_SPEED) / 1000 }
    })
    const slot: Slot = {
      id: `add:${index}`,
      team: 'enemy',
      get killer() {
        return deps.killer()
      },
      alive: false,
      hp: 0,
      motion: createAddMotion(0),
      face: 1,
      damage: 0,
      contactMs: 0,
      flashMs: 0,
      dyingMs: 0,
      windMs: 0,
      squashMs: 0,
      ageMs: 0,
      status: createStatus(),
      sprite,
      crack,
      ring,
      chip,
      sparks,
      hurtbox: () => box.setTo(slot.motion.x - SIZE / 2, floorY - slot.motion.lift - SIZE, SIZE, SIZE),
      facing: () => slot.face,
      position() {
        spot.x = slot.motion.x
        spot.y = floorY - slot.motion.lift
        return spot
      },
      isInvulnerable: () => false,
      isDead: () => slot.hp <= 0,
      receiveHit(hit: HitEvent) {
        if (slot.hp <= 0) return 0
        slot.hp -= hit.damage
        slot.flashMs = FLASH_MS
        slot.squashMs = HIT_SQUASH_MS
        if (slot.hp <= 0) {
          slot.dyingMs = DYING_MS
          slot.windMs = 0
          slot.chip.setVisible(false)
          for (const spark of slot.sparks) spark.sprite.setVisible(true)
          slot.ring.setVisible(true)
        }
        return hit.damage
      },
      applyStatus(effect: StatusEffect) {
        if (slot.hp > 0) addStatus(slot.status, effect, false)
      },
    }
    return slot
  }

  const slots = Array.from({ length: MAX_ADDS }, (_, i) => makeSlot(i))
  const baseScale = { x: slots[0].sprite.scaleX, y: slots[0].sprite.scaleY }
  const ringBase = slots[0].ring.scaleX
  const sparkBase = slots[0].sparks[0].sprite.scaleX

  function hideEffects(slot: Slot) {
    slot.crack.setVisible(false)
    slot.ring.setVisible(false)
    slot.chip.setVisible(false)
    for (const spark of slot.sparks) spark.sprite.setVisible(false)
  }

  function free(slot: Slot) {
    slot.alive = false
    slot.hp = 0
    slot.sprite.setVisible(false).clearTint()
    hideEffects(slot)
    combat.unregister(slot)
  }

  function touchesPlayer(slot: Slot): boolean {
    const target = player.hurtbox()
    const { x, lift } = slot.motion
    const feet = floorY - lift
    const half = ADD_CONTACT_SIZE / 2
    const inset = (SIZE - ADD_CONTACT_SIZE) / 2
    return x - half < target.right && x + half > target.left && feet - SIZE + inset < target.bottom && feet - inset > target.top
  }

  // Puts the body, its crack and its facing at the add's spot, at the given scale.
  function place(slot: Slot, kx: number, ky: number) {
    const m = slot.motion
    const feet = floorY - m.lift
    slot.sprite.setScale(baseScale.x * kx, baseScale.y * ky).setPosition(m.x, feet).setFlipX(slot.face < 0)
    slot.crack
      .setVisible(slot.hp < HP / 2)
      .setScale(baseScale.x * kx, baseScale.y * ky)
      .setPosition(m.x, feet)
      .setFlipX(slot.face < 0)
      .setAlpha(slot.sprite.alpha)
  }

  // Counts down the hit flash and squash and tints the body: white on a hit, blue when frozen.
  function paint(slot: Slot, dtMs: number) {
    slot.flashMs = Math.max(0, slot.flashMs - dtMs)
    slot.squashMs = Math.max(0, slot.squashMs - dtMs)
    if (slot.flashMs > 0) slot.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
    else if (slot.status.freezeMs > 0) slot.sprite.setTint(FROZEN_TINT).setTintMode(Phaser.TintModes.MULTIPLY)
    else slot.sprite.clearTint()
  }

  // The grow-in: the body scales and fades up, the ring widens and the "!" floats over it.
  function windUp(slot: Slot, dtMs: number) {
    const t = 1 - slot.windMs / ADD_WINDUP_MS
    const grow = WINDUP_FROM.scale + (1 - WINDUP_FROM.scale) * t
    slot.sprite.setAlpha(WINDUP_FROM.alpha + (1 - WINDUP_FROM.alpha) * t)
    paint(slot, dtMs)
    const hit = grow * (slot.squashMs > 0 ? HIT_SQUASH : 1)
    place(slot, hit, hit)
    const m = slot.motion
    const feet = floorY - m.lift
    const ringSize = RING_FROM + (RING_TO - RING_FROM) * t
    slot.ring.setPosition(m.x, feet - SIZE / 2).setScale((ringBase * ringSize) / RING_TO).setAlpha(0.9 * (1 - t))
    slot.chip.setPosition(m.x, feet - SIZE - 4)
    if (slot.windMs <= 0) {
      slot.ring.setVisible(false)
      slot.chip.setVisible(false)
    }
  }

  // The death pop: sparks fly out, a ring flashes and the body fades, all over DYING_MS.
  function pop(slot: Slot) {
    const t = 1 - Math.max(0, slot.dyingMs) / DYING_MS
    const m = slot.motion
    const centreY = floorY - m.lift - SIZE / 2
    slot.sprite.setAlpha(1 - t)
    slot.crack.setAlpha(1 - t)
    const ringSize = DEATH_RING_FROM + (DEATH_RING_TO - DEATH_RING_FROM) * t
    slot.ring.setPosition(m.x, centreY).setScale((ringBase * ringSize) / RING_TO).setAlpha(0.9 * (1 - t))
    const elapsed = t * DYING_MS
    for (const spark of slot.sparks) {
      spark.sprite
        .setPosition(m.x + spark.vx * elapsed, centreY + spark.vy * elapsed)
        .setScale(sparkBase * (1 - 0.5 * t))
        .setAlpha(1 - t)
    }
  }

  return {
    spawn(x, damage) {
      const slot = slots.find((candidate) => !candidate.alive)
      if (!slot) return false
      slot.alive = true
      slot.hp = HP
      const m = slot.motion
      m.x = clamp(x, deps.left + SIZE, deps.right - SIZE)
      m.lift = 0
      m.ledge = null
      m.hopMs = -1
      slot.damage = damage
      slot.contactMs = ADD_WINDUP_MS
      slot.windMs = ADD_WINDUP_MS
      slot.squashMs = 0
      slot.ageMs = 0
      slot.flashMs = 0
      slot.dyingMs = 0
      clearStatus(slot.status)
      hideEffects(slot)
      slot.chip.setVisible(true)
      slot.ring.setVisible(true)
      slot.sprite.setPosition(m.x, floorY).setScale(baseScale.x * WINDUP_FROM.scale, baseScale.y * WINDUP_FROM.scale).setVisible(true).setAlpha(WINDUP_FROM.alpha)
      combat.register(slot)
      return true
    },
    update(dtMs) {
      for (const slot of slots) {
        if (!slot.alive) continue
        if (slot.hp <= 0) {
          slot.dyingMs -= dtMs
          pop(slot)
          if (slot.dyingMs <= 0) free(slot)
          continue
        }
        slot.ageMs += dtMs
        const m = slot.motion
        const playerX = player.position().x
        slot.face = playerX >= m.x ? 1 : -1
        if (slot.windMs > 0) {
          slot.windMs = Math.max(0, slot.windMs - dtMs)
          slot.contactMs = Math.max(0, slot.contactMs - dtMs)
          windUp(slot, dtMs)
          continue
        }
        tickStatus(slot.status, dtMs)
        const scale = statusTimeScale(slot.status)
        // Stops a few units short of the player on the same surface.
        if (m.hopMs >= 0 || m.ledge !== deps.perch.ledge || Math.abs(playerX - m.x) > 6) {
          stepAdd(m, playerX, deps.perch.ledge, bounds, SIZE, dtMs * scale)
        }
        slot.contactMs = Math.max(0, slot.contactMs - dtMs * scale)
        if (scale > 0 && slot.contactMs <= 0 && !player.isDead() && touchesPlayer(slot)) {
          slot.contactMs = CONTACT_COOLDOWN_MS
          combat.spawnHitbox({
            owner: slot,
            shape: { kind: 'rect', x: -ADD_CONTACT_SIZE / 2, y: -SIZE + (SIZE - ADD_CONTACT_SIZE) / 2, w: ADD_CONTACT_SIZE, h: ADD_CONTACT_SIZE },
            follow: true,
            activeMs: CONTACT_ACTIVE_MS,
            damage: slot.damage,
            knockback: { x: 150, y: -120 },
            hitStopMs: 25,
            maxTargets: Infinity,
            tags: ['light', 'contact'],
          })
        }
        paint(slot, dtMs)
        const crouch = addCrouching(m)
        const pulse = 1 + PULSE * Math.sin((slot.ageMs / 1000) * PULSE_HZ * TAU)
        const hit = pulse * (slot.squashMs > 0 ? HIT_SQUASH : 1)
        place(slot, hit * (crouch ? CROUCH_SQUASH.x : 1), hit * (crouch ? CROUCH_SQUASH.y : 1))
      }
    },
    clear() {
      for (const slot of slots) {
        if (!slot.alive) continue
        // A contact hitbox follows its owner, so it would keep hurting after the add is gone.
        combat.cancelOwnedBy(slot)
        free(slot)
      }
    },
    destroy() {
      for (const slot of slots) {
        if (slot.alive) combat.unregister(slot)
        slot.sprite.destroy()
      }
    },
  }
}
