import Phaser from 'phaser'
import type { Combatant, CombatWorld, HitEvent } from '../../contracts/combat'
import { DEPTH, PALETTE, SCENE, TILE } from '../../contracts/constants'
import type { Bindings, InputFrame } from '../../contracts/input'
import type { AttackVariant } from '../../contracts/player'
import type { WeaponSlot } from '../../contracts/progression'
import { bindingLabel } from '../../model/input'
import { createBuild } from '../../model/progression/build'
import { createTutorial, promptFor, type Tutorial, type TutorialFact } from '../../model/tutorial/steps'
import { applySpriteRef, doorArt } from '../art'
import { PLATFORM_THICKNESS } from '../bosses'
import { cssColor } from '../color'
import { createCombatWorld } from '../combat'
import { preloadCoreAssets } from '../assets'
import { createInputLayer, type InputLayer } from '../input/InputLayer'
import { createPlayer, markOneWay, type Player } from '../player/Player'
import { buildArena } from '../scenes/arena'
import type { RunContext, TutorialControl } from '../scenes/context'
import { ENTER_ACTION, interactPressed, portalOffer } from '../scenes/interaction'
import { addTiles, type Parallax } from '../scenes/levelArt'
import { addText } from '../scenes/ui'
import { followLerp, followView, viewForBox, type View } from '../view'
import { createTrainingDummy, type TrainingDummy } from './trainingDummy'

const T = TILE
const ROOM_WIDTH = 44 * T
const LOOK_AHEAD = 56
// The card shows the filled tick this long before the next step.
const TICK_FLASH_MS = 700
// A one-way plank 2.5 tiles over the floor, for the drop-through step.
const PLANK = { x: 9 * T, w: 4 * T, top: -2.5 * T }
// How far past its ends the plank still counts as the one the player stands on.
const PLANK_SLACK = 6
const ANGRY_X = 20 * T
const CALM_X = 30 * T
const PORTAL = { x: 40 * T, w: 2 * T, h: 3 * T }
// Below this the portal is dim and shut.
const SHUT_ALPHA = 0.35

type Hold = 'pause' | 'external' | 'finished'

// The Training room: one short room, the player with the real controls and the starting build,
// two dummies and a portal. It runs the steps of model/tutorial and tells the HUD scene what to
// show. No run exists behind it: no director, no XP, no pickups, and the player cannot die.
export class TutorialScene extends Phaser.Scene implements TutorialControl {
  private readonly ctx: RunContext
  private view: View = viewForBox(1, 1)
  private combat!: CombatWorld
  private player!: Player
  private controls!: InputLayer
  private frame!: InputFrame
  private tutorial!: Tutorial
  private calm!: TrainingDummy
  private angry!: TrainingDummy
  private parallax: Parallax | null = null
  private portal: Phaser.GameObjects.Sprite | null = null
  private prompt: Phaser.GameObjects.Text | null = null
  private promptShown = false
  private promptBindings = -1
  private readonly exit = new Phaser.Geom.Rectangle(PORTAL.x - PORTAL.w / 2, -PORTAL.h, PORTAL.w, PORTAL.h)
  private readonly holds = new Set<Hold>()
  private frozen = false
  private lookAhead = 0
  // Time left on the filled card before the next step, 0 when none runs.
  private flashMs = 0
  private free = false
  private finishedEmitted = false
  private shownBindings = -1
  // What the player did, for the facts.
  private lastAttack: { slot: WeaponSlot; variant: AttackVariant; comboIndex: number } = { slot: 'light', variant: 'ground', comboIndex: 0 }
  private prevX = 0
  private wasGrounded = true
  private takeoffBottom = 0
  private peakBottom = 0
  private onPlank = false
  private prevPhase = 'idle'
  private readonly walked: { kind: 'walked'; distance: number } = { kind: 'walked', distance: 0 }
  private readonly dodgedFact: TutorialFact = { kind: 'dodged' }
  private readonly dashedFact: TutorialFact = { kind: 'dashed' }
  private readonly droppedFact: TutorialFact = { kind: 'droppedThrough' }
  private readonly cancelledFact: TutorialFact = { kind: 'cancelled' }
  private readonly pausedFact: TutorialFact = { kind: 'paused' }
  private readonly portalFact: TutorialFact = { kind: 'enteredPortal' }

  constructor(ctx: RunContext) {
    super(SCENE.tutorial)
    this.ctx = ctx
  }

  preload() {
    preloadCoreAssets(this)
  }

  create() {
    this.holds.clear()
    this.frozen = false
    this.flashMs = 0
    this.free = false
    this.finishedEmitted = false
    this.lookAhead = 0
    this.shownBindings = -1
    this.promptShown = false
    this.promptBindings = -1
    this.onPlank = false
    this.prevPhase = 'idle'
    this.wasGrounded = true
    this.time.paused = false
    this.tweens.resumeAll()

    followView(this, (view) => {
      this.view = view
      this.parallax?.layout(view)
    })
    const art = this.ctx.art
    this.combat = createCombatWorld(this, { art })
    this.controls = createInputLayer(this, this.ctx.bindings, (active) => this.ctx.cursors.setAimActive(active))
    this.frame = this.controls.frame()
    // Registered before the player's own listener, so this scene reads the input first.
    this.physics.world.on('worldstep', this.onStep, this)

    const built = buildArena(this, art, 'study', this.view, { views: ROOM_WIDTH / this.view.width, platforms: false })
    this.parallax = built.parallax
    const plank = this.physics.add.staticBody(PLANK.x, PLANK.top, PLANK.w, PLATFORM_THICKNESS)
    markOneWay(plank)
    addTiles(this, art, art.tiles(this, 'study').platform, PLANK.x, PLANK.top, PLANK.w, PLATFORM_THICKNESS)

    const frameSource: InputLayer = {
      frame: () => this.frame,
      setBindings: () => {},
      setEnabled: () => {},
      setMouseCaptured: () => {},
      destroy: () => {},
    }
    this.player = createPlayer(
      this,
      { combat: this.combat, art, input: frameSource, build: createBuild(), colliders: [...built.setup.colliders, plank] },
      built.setup.spawn.x,
      built.setup.spawn.y,
    )
    // The room cannot kill the player. A hit still flinches and knocks back.
    this.player.setLethalHitInterceptor(() => true)
    this.player.on('damaged', () => this.player.heal(1000))
    this.tutorial = createTutorial(this.player.getBuild())

    const deps = { scene: this, combat: this.combat, art, player: this.player }
    this.angry = createTrainingDummy({ ...deps, onDodged: () => this.report(this.dodgedFact) }, ANGRY_X, 0, 'angry')
    this.calm = createTrainingDummy(deps, CALM_X, 0, 'calm')

    const door = doorArt(this, PORTAL.w, PORTAL.h)
    this.portal = this.add.sprite(PORTAL.x, 0, door.textureKey).setDepth(DEPTH.tiles + 1)
    applySpriteRef(this.portal, door)
    this.prompt = addText(this, '', 7, { color: PALETTE.navy, bold: true, align: 'center' })
      .setOrigin(0.5, 1)
      .setBackgroundColor(cssColor(PALETTE.yellow))
      .setPadding(3, 1, 3, 1)
      .setDepth(DEPTH.fx)
      .setVisible(false)
      .setPosition(this.exit.centerX, this.exit.y - 24)

    // After the player's listener, so the facts read where the player is after this step.
    this.physics.world.on('worldstep', this.afterStep, this)
    this.player.on('attackStarted', (event) => {
      this.lastAttack.slot = event.slot
      this.lastAttack.variant = event.variant
      this.lastAttack.comboIndex = event.comboIndex
      this.report({ kind: 'attackStarted', slot: event.slot, variant: event.variant })
    })
    this.player.on('dashed', () => this.report(this.dashedFact))
    this.player.on('landed', () => {
      const rise = this.takeoffBottom - this.peakBottom
      this.takeoffBottom = this.peakBottom = this.player.hurtbox().bottom
      if (rise > 0) this.report({ kind: 'landed', rise })
    })
    this.combat.on('hit', (event) => this.onHit(event))

    const camera = this.cameras.main
    const { x, y, width, height } = built.setup.bounds
    camera.setBounds(x, y, width, height)
    camera.startFollow(this.player.gameObject, false)
    camera.setDeadzone(24, 40)

    const box = this.player.hurtbox()
    this.prevX = box.centerX
    this.takeoffBottom = this.peakBottom = box.bottom
    this.ctx.cursors.setLight('staff')
    this.ctx.cursors.setHeld(false)
    if (this.ctx.externalPause) this.setHold('external', true)
    this.ctx.tutorial = this
    this.events.once('shutdown', () => {
      this.controls.destroy()
      if (this.ctx.tutorial === this) this.ctx.tutorial = null
    })
    this.enterStep()
  }

  update(_time: number, delta: number) {
    if (!this.player) return
    // The world does not step while held, so the pause key is read here instead.
    if (this.physics.world.isPaused) this.readInput()
    const follow = followLerp(delta)
    this.cameras.main.setLerp(follow, follow)
    const ease = 1 - Math.exp((-Math.min(delta, 50) / 1000) * 6)
    this.lookAhead += (this.player.facing() * LOOK_AHEAD - this.lookAhead) * ease
    this.cameras.main.setFollowOffset(-this.lookAhead, 36)
    this.angry.frame(delta)
    this.calm.frame(delta)
    if (this.shownBindings !== this.ctx.bindingsVersion) {
      this.shownBindings = this.ctx.bindingsVersion
      this.pushStep()
    }
    if (this.flashMs > 0 && !this.frozen) {
      this.flashMs -= delta
      if (this.flashMs <= 0) {
        this.flashMs = 0
        this.tutorial.next()
        this.enterStep()
      }
    }
  }

  private onStep(deltaSeconds: number) {
    this.readInput()
    if (this.frozen) return
    this.combat.interruptHitStop(this.frame.pressed)
    this.combat.update(deltaSeconds * 1000)
    const stopped = this.combat.hitStopRemainingMs() > 0
    this.player.setFrozen(stopped || this.frozen)
    this.angry.setFrozen(stopped)
    this.calm.setFrozen(stopped)
    if (!stopped) {
      this.angry.update(deltaSeconds * 1000)
      this.calm.update(deltaSeconds * 1000)
    }
  }

  // Runs after the player has moved in this step.
  private afterStep() {
    if (this.frozen || this.combat.hitStopRemainingMs() > 0) return
    const player = this.player
    const box = player.hurtbox()
    const x = box.centerX
    const bottom = box.bottom
    const step = this.tutorial.current()
    const held = this.frame.held
    const direction = held.has('left') === held.has('right') ? 0 : held.has('right') ? 1 : -1

    if (step?.id === 'walk' && direction !== 0 && x !== this.prevX) {
      this.walked.distance = Math.abs(x - this.prevX)
      this.report(this.walked)
    }
    this.prevX = x

    // The rise of a jump: from where the feet left the ground to their highest point.
    const grounded = player.isGrounded()
    if (!grounded) {
      if (this.wasGrounded) this.takeoffBottom = this.peakBottom = bottom
      else if (bottom < this.peakBottom) this.peakBottom = bottom
    }
    this.wasGrounded = grounded

    // Standing on the plank, then going down through it.
    const overPlank = x > PLANK.x - PLANK_SLACK && x < PLANK.x + PLANK.w + PLANK_SLACK
    if (overPlank && grounded && Math.abs(bottom - PLANK.top) < 1.5) this.onPlank = true
    else if (!overPlank || bottom < PLANK.top - 3) this.onPlank = false
    if (this.onPlank && bottom > PLANK.top + 4) {
      this.onPlank = false
      this.report(this.droppedFact)
    }

    const debug = player.debugState()
    if (this.prevPhase !== 'idle' && (debug.motor.jumped || debug.motor.dashed)) this.report(this.cancelledFact)
    this.prevPhase = debug.attackPhase

    const open = this.portalOpen()
    const offer = portalOffer(Phaser.Geom.Intersects.RectangleToRectangle(box, this.exit), open)
    this.showPrompt(offer === 'enter')
    if (offer === 'enter' && interactPressed(this.frame.pressed)) {
      if (this.free) this.finish()
      else this.report(this.portalFact)
    }
  }

  private readInput() {
    this.frame = this.controls.frame()
    if (this.frame.pressed.has('pause') && !this.holds.has('finished') && !this.holds.has('external')) this.togglePause()
  }

  private onHit(event: HitEvent) {
    if (event.attacker !== this.player || !this.isDummy(event.target)) return
    const box = this.player.hurtbox()
    const toward = Math.sign(event.target.position().x - box.centerX)
    const held = this.frame.held
    const direction = held.has('left') === held.has('right') ? 0 : held.has('right') ? 1 : -1
    this.report({
      kind: 'hit',
      slot: this.lastAttack.slot,
      variant: this.lastAttack.variant,
      comboIndex: this.lastAttack.comboIndex,
      away: direction !== 0 && direction === -toward,
    })
  }

  private isDummy(target: Combatant): boolean {
    return target === this.calm || target === this.angry
  }

  private report(fact: TutorialFact) {
    if (this.free || this.holds.has('finished') || !this.tutorial.report(fact)) return
    if (this.tutorial.complete()) this.flashMs = TICK_FLASH_MS
    this.pushStep()
  }

  private portalOpen(): boolean {
    return this.free || this.tutorial.current()?.id === 'leave'
  }

  // Sets up what the step needs: full health, the angry dummy only for the dodge, the portal open
  // only at the end.
  private enterStep() {
    this.player.heal(1000)
    const step = this.tutorial.current()
    this.angry.setAngry(step?.id === 'dodge' || this.free)
    this.portal?.setAlpha(this.portalOpen() ? 1 : SHUT_ALPHA)
    if (!step && !this.free) {
      this.finish()
      return
    }
    this.pushStep()
  }

  private pushStep() {
    const hud = this.ctx.tutorialHud
    if (!hud) return
    const step = this.tutorial.current()
    if (!step || this.free || this.holds.has('finished')) {
      hud.showStep(null)
      return
    }
    hud.showStep({
      index: this.tutorial.index(),
      total: this.tutorial.steps.length,
      title: step.title,
      lines: promptFor(step, this.ctx.bindings),
      ticks: this.tutorial.ticks(),
      flash: this.tutorial.complete(),
    })
  }

  private finish() {
    this.flashMs = 0
    this.setHold('finished', true)
    this.pushStep()
    this.ctx.tutorialHud?.showFinish(true, this.ctx.tutorialPlan !== null)
    if (this.finishedEmitted) return
    this.finishedEmitted = true
    this.ctx.emit({ type: 'tutorialFinished' })
  }

  private togglePause() {
    const paused = !this.holds.has('pause')
    this.setHold('pause', paused)
    this.ctx.tutorialHud?.showPause(paused, this.canSkip())
    if (paused) this.report(this.pausedFact)
  }

  private canSkip(): boolean {
    return !this.free && this.tutorial.current() !== null
  }

  private setHold(reason: Hold, on: boolean) {
    if (on) this.holds.add(reason)
    else this.holds.delete(reason)
    this.ctx.cursors.setHeld(this.holds.size > 0)
    const frozen = this.holds.size > 0
    if (frozen === this.frozen) return
    this.frozen = frozen
    this.player.setFrozen(frozen)
    this.angry.setFrozen(frozen)
    this.calm.setFrozen(frozen)
    if (frozen) {
      this.physics.world.pause()
      this.time.paused = true
      this.tweens.pauseAll()
    } else {
      this.physics.world.resume()
      this.time.paused = false
      this.tweens.resumeAll()
    }
  }

  // The prompt over the portal, "[W] Enter". The text is only set again when the key changes.
  private showPrompt(show: boolean) {
    const prompt = this.prompt
    if (!prompt) return
    if (show && this.promptBindings !== this.ctx.bindingsVersion) {
      this.promptBindings = this.ctx.bindingsVersion
      const binding = this.ctx.bindings.up[0]
      prompt.setText(binding ? `[${bindingLabel(binding)}] ${ENTER_ACTION}` : ENTER_ACTION)
    }
    if (show !== this.promptShown) {
      this.promptShown = show
      prompt.setVisible(show)
    }
  }

  setExternalPause(paused: boolean) {
    if (!this.player) return
    this.setHold('external', paused)
    if (paused) this.report(this.pausedFact)
  }

  setBindings(bindings: Bindings) {
    this.controls?.setBindings(bindings)
  }

  captureMouse(captured: boolean) {
    this.controls?.setMouseCaptured(captured)
  }

  refreshHud() {
    if (!this.player) return
    this.pushStep()
    this.ctx.tutorialHud?.showPause(this.holds.has('pause'), this.canSkip())
    this.ctx.tutorialHud?.showFinish(this.holds.has('finished'), this.ctx.tutorialPlan !== null)
  }

  resume() {
    if (!this.holds.has('pause')) return
    this.setHold('pause', false)
    this.ctx.tutorialHud?.showPause(false, false)
  }

  skipStep() {
    if (!this.canSkip() || this.holds.has('finished')) return
    this.flashMs = 0
    this.resume()
    this.tutorial.skip()
    this.enterStep()
  }

  keepPracticing() {
    if (!this.holds.has('finished')) return
    this.free = true
    this.setHold('finished', false)
    this.ctx.tutorialHud?.showFinish(false, false)
    this.enterStep()
  }

  startRun() {
    const plan = this.ctx.tutorialPlan
    if (plan) this.ctx.startRun(plan)
  }
}

