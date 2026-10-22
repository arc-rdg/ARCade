import Phaser from 'phaser'
import type { ScribbleArt } from '../../contracts/art'
import type { Combatant, CombatWorld, HitEvent } from '../../contracts/combat'
import { DEPTH, PALETTE } from '../../contracts/constants'
import { createReadout, createSwingCycle, createWobble } from '../../model/tutorial/dummy'
import { applySpriteRef, DUMMY_HEIGHT, DUMMY_WIDTH, dummyArt, type DummyMood } from '../art'
import { createTelegraphPool, type TelegraphPool, type Zone } from '../bosses/telegraph'
import { addText } from '../scenes/ui'
import type { Player } from '../player/Player'

const HURTBOX = { width: 20, height: 44 }
const FLASH_MS = 70
const DAMAGE = 10
// The angry dummy's sweep: from just in front of it to this far ahead, at about the player's height.
const SWING = { from: 4, reach: 62, height: 40 }
const SWING_KNOCKBACK = { x: 160, y: -120 }
// How far the angry dummy leans back during the telegraph, and how far it throws itself forward.
const LEAN_BACK = 0.28
const LEAN_FORWARD = 0.34

export interface TrainingDummyDeps {
  scene: Phaser.Scene
  combat: CombatWorld
  art: ScribbleArt
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
  const { scene, combat, art, player } = deps
  const ref = dummyArt(scene, mood)
  const sprite = scene.add.sprite(x, floorY, ref.textureKey).setDepth(DEPTH.enemies)
  applySpriteRef(sprite, { ...ref, width: DUMMY_WIDTH, height: DUMMY_HEIGHT })
  const label = addText(scene, '', 6, { color: PALETTE.navy, bold: true, align: 'center' })
    .setOrigin(0.5, 1)
    .setBackgroundColor('#f5e6d3')
    .setPadding(3, 1, 3, 1)
    .setDepth(DEPTH.enemies + 1)
    .setPosition(x, floorY - DUMMY_HEIGHT - 6)
    .setVisible(false)

  const readout = createReadout()
  const wobble = createWobble()
  const swing = createSwingCycle()
  const hurtbox = new Phaser.Geom.Rectangle(x - HURTBOX.width / 2, floorY - HURTBOX.height, HURTBOX.width, HURTBOX.height)
  const feet = { x, y: floorY }
  const zoneBox = new Phaser.Geom.Rectangle()
  const telegraphs: TelegraphPool | null = mood === 'angry' ? createTelegraphPool(scene, art) : null
  let zone: Zone | null = null
  let facing: 1 | -1 = -1
  let flashMs = 0
  let flashing = false
  let dodged = false
  let destroyed = false
  let frozen = false
  let shownText = ''
  let attack: { cancel(): void } | null = null
  let leanForward = 0

  if (telegraphs) art.telegraph(scene, 'rect', SWING.reach - SWING.from, SWING.height)

  // The world box of the swing, in front of the dummy.
  const swingBox = () => {
    const left = facing === 1 ? x + SWING.from : x - SWING.reach
    return zoneBox.setTo(left, floorY - SWING.height, SWING.reach - SWING.from, SWING.height)
  }

  const showZone = () => {
    if (!telegraphs) return
    zone?.release()
    const box = swingBox()
    zone = telegraphs.show({
      shape: 'rect',
      x: facing === 1 ? box.left : box.right,
      y: box.centerY,
      w: box.width,
      h: box.height,
      fill: facing === 1 ? 'right' : 'left',
    })
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
      if (destroyed || !telegraphs) return
      const before = swing.phase()
      const phase = swing.step(dtMs)
      if (before !== 'telegraph' && phase === 'telegraph') {
        // Turns to the player for each swing, so the zone is never behind it.
        facing = player.hurtbox().centerX < x ? -1 : 1
        dodged = false
        showZone()
      }
      if (swing.startedActive()) {
        zone?.activate()
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
        zone?.fade()
        zone = null
        attack = null
      }
    },
    frame(deltaMs) {
      if (destroyed) return
      const now = scene.time.now
      if (telegraphs) {
        telegraphs.update(now)
        if (swing.phase() === 'telegraph') zone?.setProgress(swing.telegraphProgress())
        // Leans back while the zone fills, snaps forward at the sweep and eases upright.
        const progress = swing.telegraphProgress()
        const phase = swing.phase()
        if (phase === 'telegraph') leanForward = 0
        else if (phase === 'recover') leanForward = Math.max(0, leanForward - deltaMs / 260)
        const lean = phase === 'active' ? LEAN_FORWARD : phase === 'telegraph' ? -LEAN_BACK * progress : LEAN_FORWARD * leanForward
        sprite.setRotation(wobble.angle() + facing * lean)
      } else {
        sprite.setRotation(wobble.angle())
      }
      if (!frozen) wobble.step(deltaMs)
      flashMs = Math.max(0, flashMs - deltaMs)
      const flash = flashMs > 0
      if (flash !== flashing) {
        flashing = flash
        if (flash) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
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
      zone?.release()
      combat.unregister(dummy)
      telegraphs?.destroy()
      sprite.destroy()
      label.destroy()
    },
  }
  combat.register(dummy)
  return dummy
}
