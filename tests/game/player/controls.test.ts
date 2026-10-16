import { describe, expect, it } from 'vitest'
import { STEP_MS } from '../../../src/game/contracts/constants'
import type { Action } from '../../../src/game/contracts/input'
import type { AttackMove, AttackVariant } from '../../../src/game/contracts/player'
import {
  CHAIN_BOUNCE_HEIGHTS,
  JUMP_VELOCITY,
  MOTOR,
  PLUNGE_BOUNCE_FACTOR,
  availableJump,
  bounceFactor,
  createMotorState,
  plungeBounced,
} from '../../../src/game/model/input/motor'
import type { MotorEnv } from '../../../src/game/model/input/motor'
import { createAttackMachine } from '../../../src/game/phaser/player/attacks'
import { AIM_DEAD_ZONE, aimFacing } from '../../../src/game/model/input/motor'
import { ATTACK_GROUND_SPEED, LUNGE_MS, createControls, lungeVelocity } from '../../../src/game/phaser/player/controls'

function move(name: string, timing: Partial<AttackMove>): AttackMove {
  return { name, startupMs: 60, activeMs: 80, recoveryMs: 140, cancelAfterMs: 60, allowedInAir: true, onActive: () => {}, ...timing }
}

// Staff-like timings: a quick jab combo and a slow slam that locks.
const LIGHT = [move('jab', { lunge: 140 }), move('jab', {}), move('thrust', { startupMs: 80, activeMs: 90, recoveryMs: 220, cancelAfterMs: 130 })]
const HEAVY = [move('slam', { startupMs: 280, activeMs: 120, recoveryMs: 320, cancelAfterMs: 200, allowedInAir: false, lockMs: 150 })]
const DASH_LIGHT = move('lunge', { startupMs: 40, activeMs: 90, recoveryMs: 120, cancelAfterMs: 0, keepsMomentum: true })
const DASH_HEAVY = move('comet', { startupMs: 70, activeMs: 160, recoveryMs: 220, cancelAfterMs: 150, lockMs: 150 })
const AIR_HEAVY = move('meteor', { startupMs: 90, activeMs: 0, recoveryMs: 220, cancelAfterMs: 160, landingLockMs: 220, plunge: { speed: 700 } })

// The mage on a flat floor at y = 0 (y grows downwards), stepped like Player's onStep.
function setup(mechanics: Partial<MotorEnv['mechanics']> = {}) {
  const motor = createMotorState()
  const motorEnv: MotorEnv = {
    grounded: true,
    touchingWallLeft: false,
    touchingWallRight: false,
    stats: { moveSpeed: 1, dashCooldownMs: 2000 },
    mechanics: { doubleJump: false, airDash: false, wallJump: false, hatGlide: false, ...mechanics },
    speedScale: 1,
    actionsLocked: false,
  }
  const cursor = { dx: 0, recent: false }
  const started: { name: string; variant: AttackVariant }[] = []
  const attacks = createAttackMachine({
    movesFor: (slot) => (slot === 'light' ? LIGHT : HEAVY),
    variantFor(slot, variant) {
      if (variant === 'dash') return slot === 'light' ? DASH_LIGHT : DASH_HEAVY
      if (variant === 'air') return slot === 'heavy' ? AIR_HEAVY : null
      return null
    },
    onStart(_slot, _index, m, variant) {
      // What Player does first on an attack start.
      controls.faceCursor(cursor.dx, cursor.recent)
      started.push({ name: m.name, variant })
      if (variant === 'dash') {
        motor.dashMs = 0
        controls.endDashGrace()
      }
    },
    onActive: () => {},
  })
  const controls = createControls(motor, motorEnv, attacks)
  let y = 0
  const released = new Set<string>()
  let x = 0
  // Held keys stay held between steps, as on a keyboard. A press is held too, as before.
  let heldKeys: Action[] = []
  const stepWith = (pressed: Action[], attacksBlocked: boolean, controllable: boolean, controlInMs: number) => {
    motorEnv.grounded = y >= 0
    const set = new Set<string>(pressed)
    const held = new Set<string>([...pressed, ...heldKeys])
    const presses = { light: set.has('light'), heavy: set.has('heavy'), up: false }
    controls.step({ held, pressed: set, released }, presses, controllable, 1, STEP_MS, attacksBlocked, controlInMs)
    x += (motor.vx * STEP_MS) / 1000
    y += (motor.vy * STEP_MS) / 1000
    if (y >= 0) {
      y = 0
      if (motor.vy > 0) motor.vy = 0
    }
  }
  const step = (pressed: Action[] = [], attacksBlocked = false) => stepWith(pressed, attacksBlocked, true, 0)
  const wait = (ms: number) => {
    for (let n = Math.round(ms / STEP_MS); n > 0; n--) step()
  }
  const hold = (...keys: Action[]) => {
    heldKeys = keys
  }
  // A step while hurt: the mage cannot act for another `controlInMs`.
  const hurtStep = (controlInMs: number, pressed: Action[] = []) => stepWith(pressed, false, false, controlInMs)
  // What Player does when the first hit of an air heavy lands. `chains` is Serial Dilution.
  const bounce = (chains = false) => {
    if (!attacks.onOwnHit()) return false
    motor.vy = -JUMP_VELOCITY * plungeBounced(motor, chains)
    return true
  }
  return { motor, motorEnv, attacks, started, cursor, step, wait, hold, hurtStep, bounce, x: () => x, airborne: () => y < 0 }
}

describe('createControls', () => {
  it('drops light and heavy presses while attacks are blocked, and keeps moving and jumping', () => {
    const { motor, attacks, started, step, wait } = setup()
    step(['light'], true)
    step(['heavy'], true)
    wait(300)
    expect(started).toEqual([])
    expect(attacks.phase()).toBe('idle')
    step(['jump'], true)
    expect(motor.jumped).toBe(true)
  })

  it('does not replay a blocked press once the block ends', () => {
    const { started, step, wait } = setup()
    step(['light'], true)
    step([], false)
    wait(300)
    expect(started).toEqual([])
    step(['light'])
    expect(started.length).toBe(1)
  })

  it('starts a jump on the press step during the recovery of a light attack', () => {
    const { motor, attacks, step, wait } = setup()
    step(['light'])
    // Startup and active are over, recovery has not reached its cancel window.
    wait(150)
    expect(attacks.phase()).toBe('recovery')
    expect(attacks.canCancel()).toBe(false)
    step(['jump'])
    expect(motor.jumped).toBe(true)
    expect(attacks.phase()).toBe('idle')
  })

  it('starts a jump during the windup and the lock of a heavy attack', () => {
    const { motor, attacks, step, wait } = setup()
    step(['heavy'])
    wait(100)
    expect(attacks.phase()).toBe('startup')
    step(['jump'])
    expect(motor.jumped).toBe(true)

    const locked = setup()
    locked.step(['heavy'])
    // The active phase ends at 400 ms, the lock runs 150 ms after it.
    locked.wait(420)
    expect(locked.attacks.lockRemainingMs()).toBeGreaterThan(0)
    locked.step(['jump'])
    expect(locked.motor.jumped).toBe(true)
    expect(locked.attacks.lockRemainingMs()).toBe(0)
  })

  it('starts a dash on the press step during an attack', () => {
    const { motor, attacks, step, wait } = setup()
    step(['heavy'])
    wait(150)
    step(['dash'])
    expect(motor.dashed).toBe(true)
    expect(attacks.phase()).toBe('idle')
  })

  it('keeps the current attack when the dash is on cooldown', () => {
    const { motor, attacks, step, wait } = setup()
    step(['dash'])
    wait(400)
    step(['heavy'])
    wait(100)
    step(['dash'])
    expect(motor.dashed).toBe(false)
    expect(attacks.phase()).toBe('startup')
  })

  it('plays the dash variant when the dash ends, not cutting the dash short', () => {
    const { motor, started, step, wait } = setup()
    step(['dash'])
    wait(30)
    step(['light'])
    let dashSteps = 2 + Math.round(30 / STEP_MS)
    while (motor.dashMs > 0) {
      expect(started).toHaveLength(0)
      step()
      dashSteps++
    }
    expect(dashSteps * STEP_MS).toBeGreaterThanOrEqual(MOTOR.dashMs - STEP_MS)
    step()
    expect(started).toEqual([{ name: 'lunge', variant: 'dash' }])
  })

  it('keeps an attack pressed on the dash step until the dash ends', () => {
    const { started, step, wait } = setup()
    step(['dash', 'heavy'])
    wait(MOTOR.dashMs + 2 * STEP_MS)
    expect(started).toEqual([{ name: 'comet', variant: 'dash' }])
  })

  it('plays the air variant for an attack pressed with the jump', () => {
    const { motor, started, step, wait } = setup()
    step(['jump', 'heavy'])
    expect(motor.jumped).toBe(true)
    wait(2 * STEP_MS)
    expect(started).toEqual([{ name: 'meteor', variant: 'air' }])
  })

  it('never leaves the mage unable to act while presses are spammed', () => {
    const { motor, attacks, started, step, wait, airborne } = setup()
    const rotation: Action[][] = [['light'], ['jump'], ['heavy'], ['dash'], ['light', 'jump'], ['heavy'], ['dash', 'light'], ['jump']]
    for (let i = 0; i < 120; i++) {
      const pressed = rotation[i % rotation.length]
      const onGround = !airborne() && motor.vy >= 0
      const dashReady = motor.dashCooldownMs <= STEP_MS && motor.dashMs <= 0
      step(pressed)
      if (pressed.includes('jump') && onGround) expect(motor.jumped).toBe(true)
      if (pressed.includes('dash') && onGround && dashReady) expect(motor.dashed).toBe(true)
      wait(40)
    }
    expect(started.length).toBeGreaterThan(10)

    wait(3000)
    expect(attacks.phase()).toBe('idle')
    step(['jump'])
    expect(motor.jumped).toBe(true)
    wait(1500)
    step(['dash'])
    expect(motor.dashed).toBe(true)
    wait(1000)
    const before = started.length
    step(['light'])
    expect(started).toHaveLength(before + 1)
  })

  describe('one air heavy per airtime', () => {
    const meteors = (started: { name: string }[]) => started.filter((s) => s.name === 'meteor').length

    it('refuses a second air heavy after the bounce until the mage lands', () => {
      const { started, step, wait, bounce, airborne } = setup()
      step(['jump'])
      wait(150)
      step(['heavy'])
      // Startup ends, the fall hits an enemy.
      wait(100)
      expect(bounce()).toBe(true)
      wait(150)
      expect(airborne()).toBe(true)
      step(['heavy'])
      wait(50)
      expect(meteors(started)).toBe(1)
      // A press that stayed buffered would slam on the landing, so it must be gone.
      wait(600)
      expect(airborne()).toBe(false)
      expect(started).toHaveLength(1)
    })

    it('allows the air heavy again after landing', () => {
      const { started, step, wait, bounce, airborne } = setup()
      step(['jump'])
      wait(150)
      step(['heavy'])
      wait(100)
      bounce()
      wait(800)
      expect(airborne()).toBe(false)
      step(['jump'])
      wait(150)
      step(['heavy'])
      expect(meteors(started)).toBe(2)
    })

    it('does not give back a used double jump', () => {
      const { motor, motorEnv, step, wait, bounce } = setup({ doubleJump: true })
      step(['jump'])
      wait(150)
      step(['jump'])
      expect(motor.jumpsUsed).toBe(2)
      wait(100)
      step(['heavy'])
      wait(100)
      expect(bounce()).toBe(true)
      expect(motor.jumpsUsed).toBe(2)
      expect(availableJump(motor, motorEnv)).toBeNull()
    })

    it('gives no jump off the floor when the landing ring bounces the mage', () => {
      const { motor, motorEnv, step, wait, bounce, airborne } = setup()
      step(['jump'])
      wait(150)
      step(['heavy'])
      // Falls at 700 per second, lands well within this, and the ring hits right after.
      for (let n = 0; n < 100 && airborne(); n++) wait(10)
      expect(airborne()).toBe(false)
      // The step that stands the mage on the floor lands the plunge, and its ring hits.
      wait(10)
      expect(motor.coyoteMs).toBeGreaterThan(0)
      expect(bounce()).toBe(true)
      wait(20)
      expect(availableJump(motor, motorEnv)).toBeNull()
      step(['jump'])
      expect(motor.jumped).toBe(false)
    })
  })
})

describe('Serial Dilution', () => {
  const meteors = (started: { name: string }[]) => started.filter((s) => s.name === 'meteor').length

  // Jumps, then plunges and bounces `count` times. Each plunge hits 100 ms after the press and
  // the next press comes 150 ms into the bounce, well before its peak.
  function chain(count: number, chains: boolean) {
    const rig = setup()
    rig.step(['jump'])
    rig.wait(150)
    for (let i = 0; i < count; i++) {
      rig.step(['heavy'])
      rig.wait(100)
      rig.bounce(chains)
      rig.wait(150)
    }
    return rig
  }

  it('lets a plunge that hit start another one before landing', () => {
    const { started, step, airborne } = chain(1, true)
    expect(airborne()).toBe(true)
    step(['heavy'])
    expect(meteors(started)).toBe(2)
  })

  it('keeps one air heavy per airtime without the card', () => {
    const { started, step, wait, airborne } = chain(1, false)
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(50)
    expect(meteors(started)).toBe(1)
  })

  it('refuses a sixth air heavy in one airtime', () => {
    const { started, step, wait, motor, airborne } = chain(5, true)
    expect(meteors(started)).toBe(5)
    expect(motor.plungeChain).toBe(5)
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(50)
    expect(meteors(started)).toBe(5)
  })

  it('starts the count over on landing', () => {
    const { started, step, wait, motor, airborne } = chain(5, true)
    wait(1500)
    expect(airborne()).toBe(false)
    expect(motor.plungeChain).toBe(0)
    step(['jump'])
    wait(150)
    step(['heavy'])
    expect(meteors(started)).toBe(6)
  })

  it('gives back no jump with a chained bounce', () => {
    const { motor, motorEnv } = chain(2, true)
    expect(motor.jumpsUsed).toBe(1)
    expect(motor.coyoteMs).toBe(0)
    expect(availableJump(motor, motorEnv)).toBeNull()
  })

  it('bounces a full jump high first and lower on every further bounce', () => {
    expect(bounceFactor(1, true) * JUMP_VELOCITY).toBeCloseTo(JUMP_VELOCITY)
    // Height grows with the square of the launch speed.
    const heights = [1, 2, 3, 4, 5].map((link) => bounceFactor(link, true) ** 2)
    expect(heights).toEqual(CHAIN_BOUNCE_HEIGHTS.map((h) => expect.closeTo(h, 6)))
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1])
    expect(bounceFactor(1, false)).toBe(PLUNGE_BOUNCE_FACTOR)
  })
})

describe('player feel', () => {
  it('fires a jump pressed 100 ms before a flinch ends on the first free step', () => {
    const { motor, hurtStep, step } = setup()
    hurtStep(100, ['jump'])
    for (let left = 90; left > 0; left -= STEP_MS) hurtStep(left)
    expect(motor.jumped).toBe(false)
    step()
    expect(motor.jumped).toBe(true)
  })

  it('carries a dash and an attack pressed late in a stun, and drops earlier presses', () => {
    const late = setup()
    late.hurtStep(80, ['dash', 'light'])
    late.hurtStep(70)
    late.step()
    expect(late.motor.dashed).toBe(true)

    const lightRig = setup()
    lightRig.hurtStep(80, ['light'])
    lightRig.step()
    expect(lightRig.started.map((s) => s.name)).toEqual(['jab'])

    const early = setup()
    early.hurtStep(300, ['jump', 'light'])
    early.hurtStep(100)
    early.step()
    expect(early.motor.jumped).toBe(false)
    expect(early.started).toEqual([])
  })

  it('runs at half speed while a move starts and strikes, and at full speed once it can be cancelled', () => {
    const { motor, motorEnv, attacks, step, hold } = setup()
    hold('right')
    step(['light'])
    let guarded = 0
    while (attacks.phase() !== 'idle') {
      step()
      if (attacks.canCancel()) {
        expect(motorEnv.speedScale).toBe(1)
      } else if (attacks.phase() !== 'idle') {
        expect(motorEnv.speedScale).toBe(0.5)
        // The lunge pushes faster than the half speed, for its short window only.
        if (attacks.moveElapsedMs() > 160) expect(motor.vx).toBeLessThanOrEqual(MOTOR.runSpeed * 0.5 + 1)
        guarded++
      }
    }
    expect(guarded).toBeGreaterThan(5)
  })

  it('keeps the aim facing through the recovery while running the other way', () => {
    const { motor, attacks, cursor, step, wait, hold } = setup()
    cursor.dx = 200
    cursor.recent = true
    step(['light'])
    expect(motor.facing).toBe(1)
    hold('left')
    // Well past the cancel window of the first jab, still in its recovery.
    wait(220)
    expect(attacks.canCancel()).toBe(true)
    expect(attacks.phase()).toBe('recovery')
    expect(motor.facing).toBe(1)
    wait(200)
    expect(attacks.phase()).toBe('idle')
    step()
    expect(motor.facing).toBe(-1)
  })

  it('pushes faster than the half-speed run for the first 60 ms of the active phase, and stays put without a direction', () => {
    const lunging = setup()
    lunging.hold('right')
    lunging.step(['light'])
    while (lunging.attacks.phase() !== 'active') lunging.step()
    const speeds: number[] = []
    for (let ms = 0; ms < LUNGE_MS - STEP_MS; ms += STEP_MS) {
      lunging.step()
      speeds.push(lunging.motor.vx)
    }
    expect(speeds.length).toBeGreaterThan(3)
    for (const vx of speeds) expect(vx).toBeCloseTo(140)
    expect(140).toBeGreaterThan(MOTOR.runSpeed * ATTACK_GROUND_SPEED)

    const standing = setup()
    standing.step(['light'])
    standing.wait(300)
    expect(standing.x()).toBe(0)
  })

  it('turns a keyboard player to the held direction once the cancel window opens, but not before', () => {
    const { motor, attacks, step, wait, hold } = setup()
    step(['light'])
    expect(motor.facing).toBe(1)
    hold('left')
    wait(40)
    expect(attacks.canCancel()).toBe(false)
    expect(motor.facing).toBe(1)
    wait(200)
    expect(attacks.canCancel()).toBe(true)
    expect(attacks.phase()).toBe('recovery')
    expect(motor.facing).toBe(-1)
  })
})

describe('lungeVelocity', () => {
  it('lunges towards the facing while a direction is held', () => {
    expect(lungeVelocity(140, 1, false, true, true, 0)).toBe(140)
    expect(lungeVelocity(140, -1, true, false, false, 50)).toBe(-140)
  })

  it('never slows a mage who already moves faster in that direction', () => {
    expect(lungeVelocity(80, 1, false, true, true, 105)).toBe(105)
    expect(lungeVelocity(140, -1, true, false, false, -200)).toBe(-200)
    expect(lungeVelocity(80, 1, false, true, true, 40)).toBe(80)
    expect(lungeVelocity(80, 1, false, true, true, -50)).toBe(80)
  })

  it('stops a walking mage on the ground without a direction', () => {
    expect(lungeVelocity(140, 1, false, false, true, 210)).toBe(0)
    // Both held cancel out, as they do for the motor.
    expect(lungeVelocity(140, 1, true, true, true, 210)).toBe(0)
  })

  it('keeps the air speed without a direction', () => {
    expect(lungeVelocity(140, 1, false, false, false, -90)).toBe(-90)
  })
})

describe('facing the cursor', () => {
  it('turns to a recently used cursor when an attack starts, while walking the other way', () => {
    const { motor, cursor, step } = setup()
    cursor.dx = 200
    cursor.recent = true
    step(['left'])
    expect(motor.facing).toBe(-1)
    step(['left', 'light'])
    expect(motor.facing).toBe(1)
    for (let n = 0; n < 6; n++) step(['left'])
    expect(motor.facing).toBe(1)
    expect(motor.vx).toBeLessThan(0)
  })

  it('keeps the held direction without a recent pointer', () => {
    const { motor, cursor, step } = setup()
    cursor.dx = 200
    step(['left'])
    step(['left', 'light'])
    expect(motor.facing).toBe(-1)
  })

  it('keeps the facing for the whole attack even when the cursor crosses', () => {
    const { motor, cursor, step } = setup()
    cursor.dx = 200
    cursor.recent = true
    step(['light'])
    cursor.dx = -200
    for (let n = 0; n < 6; n++) step(['left'])
    expect(motor.facing).toBe(1)
  })

  it('checks the cursor again on the next hit of a combo', () => {
    const { motor, attacks, cursor, step, wait } = setup()
    cursor.dx = 200
    cursor.recent = true
    step(['light'])
    expect(motor.facing).toBe(1)
    wait(150)
    expect(attacks.canCancel()).toBe(false)
    cursor.dx = -200
    wait(60)
    step(['light'])
    expect(motor.facing).toBe(-1)
  })
})

describe('aimFacing', () => {
  it('follows the cursor side only with a recent pointer', () => {
    expect(aimFacing(50, true, -1)).toBe(1)
    expect(aimFacing(-50, true, 1)).toBe(-1)
    expect(aimFacing(50, false, -1)).toBe(-1)
  })

  it('ignores a cursor inside the dead zone', () => {
    expect(aimFacing(AIM_DEAD_ZONE, true, -1)).toBe(-1)
    expect(aimFacing(-AIM_DEAD_ZONE, true, 1)).toBe(1)
  })
})
