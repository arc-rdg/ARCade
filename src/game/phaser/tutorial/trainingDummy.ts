import Phaser from 'phaser'
import type { Combatant, CombatWorld, HitEvent } from '../../contracts/combat'
import { DEPTH, PALETTE } from '../../contracts/constants'
import { createReadout, createSwingCycle, createWobble, SWING_TELEGRAPH_MS } from '../../model/tutorial/dummy'
import { applySpriteRef, DUMMY_HEIGHT, DUMMY_WIDTH, dummyArt, type DummyMood } from '../art'
import { TELL_FLASH_MS } from '../mobs/tuning'
import { windupForm } from '../mobs/windup'
import { addText } from '../scenes/ui'
import type { Player } from '../player/Player'

const HURTBOX = { width: 20, height: 44 }
const FLASH_MS = 70
const DAMAGE = 10
// The angry dummy's sweep: from just in front of it to this far ahead, at about the player's height.
const SWING = { from: 4, reach: 62, height: 40 }
const SWING_KNOCKBACK = { x: 160, y: -120 }
// How far the angry dummy leans back during the wind-up, and how far it throws itself forward.
const LEAN_BACK = 0.55
const LEAN_FORWARD = 0.34

export interface TrainingDummyDeps {
  scene: Phaser.Scene
  combat: CombatWorld
  player: Player
  // The angry dummy's swing reached the player while a dash made the player untouchable.
  onDodged?: () => void
}

export interface TrainingDummy extends Combatant {
  // Once per fixed step while the world runs.
  update(dtMs: number): void
  // Once per rendered frame.
  frame(deltaMs: number): void
  // Whether the dummy goes on swinging. The swing that runs finishes.
  setAngry(on: boolean): void
  // Holds the wobble still with the world.
  setFrozen(frozen: boolean): void
  destroy(): void
}

// A target that shows the damage it takes and never dies. The angry one also swings at the player,
// never moves, and only while the room asks for it.
export function createTrainingDummy(deps: TrainingDummyDeps, x: number, floorY: number, mood: DummyMood): TrainingDummy {
  const { scene, combat, player } = deps
  const ref = dummyArt(scene, mood)
  const sprite = scene.add.sprite(x, floorY, ref.textureKey).setDepth(DEPTH.enemies)
  applySpriteRef(sprite, { ...ref, width: DUMMY_WIDTH, height: DUMMY_HEIGHT })
  const label = addText(scene, '', 7, { color: PALETTE.navy, bold: true, align: 'center' })
    .setOrigin(0.5, 1)
    .setBackgroundColor('#f5e6d3')
    .setPadding(3, 1, 3, 1)
    .setDepth(DEPTH.enemies + 1)
    .setPosition(x, floorY - DUMMY_HEIGHT - 18)
    .setVisible(false)

  const readout = createReadout()
  const wobble = createWobble()
  const swing = createSwingCycle()
  const hurtbox = new Phaser.Geom.Rectangle(x - HURTBOX.width / 2, floorY - HURTBOX.height, HURTBOX.width, HURTBOX.height)
  const feet = { x, y: floorY }
  const zoneBox = new Phaser.Geom.Rectangle()
  const angry = mood === 'angry'
  let facing: 1 | -1 = -1
  let flashMs = 0
  // The body tint: 0 none, 1 hit flash, 2 wind-up onset flash, 3 warm wind-up tint.
  let tint = 0
  let tellMs = 0
  let dodged = false
  let destroyed = false
  let frozen = false
  let shownText = ''
  let attack: { cancel(): void } | null = null
  let leanForward = 0

  // The world box of the swing, in front of the dummy.
  const swingBox = () => {
    const left = facing === 1 ? x + SWING.from : x - SWING.reach
    return zoneBox.setTo(left, floorY - SWING.height, SWING.reach - SWING.from, SWING.height)
  }

  const dummy: TrainingDummy = {
    id: `dummy-${mood}`,
    team: 'enemy',
    killer: { kind: 'hazard', label: 'Training dummy' },
    hurtbox: () => hurtbox,
    facing: () => facing,
    position: () => feet,
    isInvulnerable: () => false,
    isDead: () => false,
    receiveHit(hit: HitEvent) {
      readout.hit(hit.damage, scene.time.now)
      wobble.impulse(hit.knockback.x, hit.damage)
      flashMs = FLASH_MS
      return hit.damage
    },
    setAngry: (on) => swing.enable(on),
    setFrozen(next) {
      frozen = next
    },
    update(dtMs) {
      if (destroyed || !angry) return
      const before = swing.phase()
      const phase = swing.step(dtMs)
      if (before !== 'telegraph' && phase === 'telegraph') {
        // Turns to the player for each swing, so the zone is never behind it.
        facing = player.hurtbox().centerX < x ? -1 : 1
        dodged = false
        tellMs = TELL_FLASH_MS
      }
      if (swing.startedActive()) {
        attack = combat.spawnHitbox({
          owner: dummy,
          shape: { kind: 'rect', x: SWING.from, y: -SWING.height, w: SWING.reach - SWING.from, h: SWING.height },
          follow: false,
          activeMs: 150,
          damage: DAMAGE,
          knockback: SWING_KNOCKBACK,
          hitStopMs: 80,
          maxTargets: 1,
        })
        leanForward = 1
      }
      if (phase === 'active' && !dodged && player.debugState().motor.dashIframesMs > 0 && Phaser.Geom.Intersects.RectangleToRectangle(swingBox(), player.hurtbox())) {
        dodged = true
        deps.onDodged?.()
      }
      if (before === 'active' && phase === 'recover') {
        attack = null
      }
    },
    frame(deltaMs) {
      if (destroyed) return
      const now = scene.time.now
      const phase = swing.phase()
      if (angry) {
        // Leans back at once and holds it, snaps forward at the sweep and eases upright.
        if (phase === 'telegraph') leanForward = 0
        else if (phase === 'recover') leanForward = Math.max(0, leanForward - deltaMs / 260)
        const back = phase === 'telegraph' ? -LEAN_BACK * windupForm(swing.telegraphProgress() * SWING_TELEGRAPH_MS, SWING_TELEGRAPH_MS) : 0
        const lean = phase === 'active' ? LEAN_FORWARD : phase === 'telegraph' ? back : LEAN_FORWARD * leanForward
        sprite.setRotation(wobble.angle() + facing * lean)
        if (phase === 'telegraph' && !frozen) tellMs = Math.max(0, tellMs - deltaMs)
      } else {
        sprite.setRotation(wobble.angle())
      }
      if (!frozen) wobble.step(deltaMs)
      flashMs = Math.max(0, flashMs - deltaMs)
      const code = flashMs > 0 ? 1 : phase === 'telegraph' ? (tellMs > 0 ? 2 : 3) : 0
      if (code !== tint) {
        tint = code
        if (code === 1) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
        else if (code === 2) sprite.setTint(0xff7a3d).setTintMode(Phaser.TintModes.FILL)
        else if (code === 3) sprite.setTint(0xffa070).setTintMode(Phaser.TintModes.MULTIPLY)
        else sprite.clearTint()
      }
      if (readout.update(now)) {
        const combo = readout.combo()
        const dps = readout.dps()
        const text = combo === 0 && dps === 0 ? '' : `${combo > 1 ? `×${combo}  ` : ''}${dps} dmg/s`
        if (text !== shownText) {
          shownText = text
          label.setText(text).setVisible(text !== '')
        }
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      attack?.cancel()
      combat.unregister(dummy)
      sprite.destroy()
      label.destroy()
    },
  }
  combat.register(dummy)
  return dummy
}
