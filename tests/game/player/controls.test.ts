import { describe, expect, it } from 'vitest'
import { STEP_MS } from '../../../src/game/contracts/constants'
import type { Action } from '../../../src/game/contracts/input'
import type { AttackMove, AttackVariant } from '../../../src/game/contracts/player'
import {
  HOP_MAX_HOLD_MS,
  JUMP_VELOCITY,
  MOTOR,
  PLUNGE_CHAIN_MAX,
  availableJump,
  createMotorState,
  dashAttackStarted,
  plungeBounced,
  runSpeed,
} from '../../../src/game/model/input/motor'
import type { MotorEnv } from '../../../src/game/model/input/motor'
import { createAttackMachine } from '../../../src/game/phaser/player/attacks'
import { AIM_DEAD_ZONE, aimFacing } from '../../../src/game/model/input/motor'
import { createControls } from '../../../src/game/phaser/player/controls'

function move(name: string, timing: Partial<AttackMove>): AttackMove {
  return { name, startupMs: 60, activeMs: 80, recoveryMs: 140, cancelAfterMs: 60, allowedInAir: true, onActive: () => {}, ...timing }
}

// Staff-like timings: a quick jab combo and a slow slam that locks.
const LIGHT = [move('jab', {}), move('jab', {}), move('thrust', { startupMs: 80, activeMs: 90, recoveryMs: 220, cancelAfterMs: 130 })]
const HEAVY = [move('slam', { startupMs: 280, activeMs: 120, recoveryMs: 320, cancelAfterMs: 200, allowedInAir: false, lockMs: 150 })]
const DASH_LIGHT = move('lunge', { startupMs: 40, activeMs: 90, recoveryMs: 120, cancelAfterMs: 0 })
const DASH_HEAVY = move('comet', { startupMs: 70, activeMs: 160, recoveryMs: 220, cancelAfterMs: 150, lockMs: 150 })
const AIR_HEAVY = move('meteor', { startupMs: 90, activeMs: 0, recoveryMs: 220, cancelAfterMs: 160, landingLockMs: 220, plunge: { speed: 700 } })

// The mage on a flat floor at y = 0 (y grows downwards), stepped like Player's onStep.
function setup(mechanics: Partial<MotorEnv['mechanics']> = {}) {
  const motor = createMotorState()
  const motorEnv: MotorEnv = {
    grounded: true,
    stats: { moveSpeed: 1, dashCooldownMs: 2000 },
    mechanics: { doubleJump: false, airDash: false, hatGlide: false, ...mechanics },
    speedScale: 1,
    actionsLocked: false,
  }
  const cursor = { dx: 0, recent: false }
  let floorY = 0
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
        dashAttackStarted(motor, new Set(heldKeys), motorEnv)
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
    motorEnv.grounded = y >= floorY
    const set = new Set<string>(pressed)
    const held = new Set<string>([...pressed, ...heldKeys])
    const presses = { light: set.has('light'), heavy: set.has('heavy'), up: false }
    controls.step({ held, pressed: set, released }, presses, controllable, 1, STEP_MS, attacksBlocked, controlInMs)
    x += (motor.vx * STEP_MS) / 1000
    y += (motor.vy * STEP_MS) / 1000
    if (y >= floorY) {
      y = floorY
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
  // What Player does when the first hit of an air heavy lands. `chains` is the pogo card.
  const bounce = (chains = false) => {
    if (!attacks.onOwnHit()) return false
    plungeBounced(motor, chains)
    motor.vy = -JUMP_VELOCITY
    return true
  }
  // The mage steps off a ledge `height` above the floor, as after walking off it.
  const lift = (height: number) => {
    y = -height
    motor.coyoteMs = MOTOR.coyoteMs
  }
  // Holds jump for `holdMs`, then lets go. The default is a full jump.
  const longJump = (holdMs = 150) => {
    hold('jump')
    step(['jump'])
    wait(holdMs)
    hold()
  }
  // Steps until the mage is past the apex (rising ends), at most one second.
  const toApex = () => {
    for (let n = 0; n < 125 && motor.vy < 0; n++) step()
  }
  // Moves the floor to `depth` below the start, as when a hop is taken off a ledge.
  const setFloor = (depth: number) => {
    floorY = depth
  }
  return { motor, motorEnv, attacks, controls, started, cursor, setFloor, toApex, step, wait, hold, hurtStep, bounce, lift, longJump, x: () => x, y: () => y, airborne: () => y < floorY }
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

  it('drops a heavy pressed on the step a jump leaves the ground', () => {
    const { motor, started, step, wait } = setup()
    step(['jump', 'heavy'])
    expect(motor.jumped).toBe(true)
    wait(300)
    expect(started).toEqual([])
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
      const { started, step, wait, bounce, airborne, longJump, toApex } = setup()
      longJump()
      step(['heavy'])
      toApex()
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
      const { started, step, wait, bounce, airborne, longJump, toApex } = setup()
      longJump()
      step(['heavy'])
      toApex()
      wait(100)
      bounce()
      wait(800)
      expect(airborne()).toBe(false)
      longJump()
      step(['heavy'])
      toApex()
      wait(STEP_MS)
      expect(meteors(started)).toBe(2)
    })

    it('does not give back a used double jump', () => {
      const { motor, motorEnv, step, wait, bounce, longJump, toApex } = setup({ doubleJump: true })
      longJump()
      step(['jump'])
      expect(motor.jumpsUsed).toBe(2)
      wait(100)
      step(['heavy'])
      toApex()
      wait(100)
      expect(bounce()).toBe(true)
      expect(motor.jumpsUsed).toBe(2)
      expect(availableJump(motor, motorEnv)).toBeNull()
    })

    it('gives no jump off the floor when the landing ring bounces the mage', () => {
      const { motor, motorEnv, step, wait, bounce, airborne, longJump } = setup()
      longJump()
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

const meteors = (started: { name: string }[]) => started.filter((s) => s.name === 'meteor').length
const afterDash = (rig: { wait(ms: number): void }) => rig.wait(MOTOR.dashMs + 120)

describe('downward attack', () => {
  it('is refused after a hop', () => {
    const { started, step, wait, airborne, longJump } = setup()
    longJump(30)
    wait(60)
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(100)
    expect(meteors(started)).toBe(0)
  })

  it('is refused after a hop even when jump was held almost long enough', () => {
    const { started, step, wait, longJump } = setup()
    longJump(HOP_MAX_HOLD_MS - 3 * STEP_MS)
    wait(60)
    step(['heavy'])
    wait(100)
    expect(meteors(started)).toBe(0)
  })

  it('plays at once when heavy is pressed past the apex of a held jump', () => {
    const rig = setup()
    rig.longJump()
    rig.toApex()
    rig.step(['heavy'])
    expect(rig.started).toEqual([{ name: 'meteor', variant: 'air' }])
  })

  it('starts a heavy pressed early in a held jump only at the apex', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    while (rig.motor.vy < 0) {
      expect(rig.started).toEqual([])
      rig.step()
    }
    rig.step()
    expect(meteors(rig.started)).toBe(1)
    expect(rig.controls.heavyPending()).toBe(false)
    expect(rig.motor.vy).toBeGreaterThanOrEqual(0)
  })

  it('drops a heavy pressed early in a jump that turns out a hop', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    rig.hold()
    rig.step()
    rig.step()
    expect(rig.controls.heavyPending()).toBe(false)
    rig.toApex()
    rig.wait(600)
    expect(rig.started).toEqual([])
  })

  it('drops a pending heavy when a dash starts', () => {
    const rig = setup({ airDash: true })
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    rig.step(['dash'])
    expect(rig.controls.heavyPending()).toBe(false)
    rig.wait(MOTOR.dashMs + 120)
    rig.toApex()
    rig.wait(600)
    expect(meteors(rig.started)).toBe(0)
  })

  it('drops a pending heavy when another attack starts', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    rig.step(['light'])
    expect(rig.controls.heavyPending()).toBe(false)
    rig.toApex()
    rig.wait(600)
    expect(meteors(rig.started)).toBe(0)
  })

  it('drops a pending heavy when the mage is hurt', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    rig.hurtStep(100)
    expect(rig.controls.heavyPending()).toBe(false)
    rig.toApex()
    rig.wait(600)
    expect(meteors(rig.started)).toBe(0)
  })

  it('drops a pending heavy on a teleport', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    rig.controls.cancelPending()
    expect(rig.controls.heavyPending()).toBe(false)
  })

  it('plays nothing when heavy comes right after a jump that is then tapped', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.hold()
    rig.wait(600)
    expect(rig.started).toEqual([])
  })

  it('plays nothing for a heavy buffered on the ground when the jump that follows is a tap', () => {
    const rig = setup()
    rig.step(['light'])
    rig.step(['heavy'])
    rig.hold('jump')
    rig.step(['jump'])
    rig.hold()
    rig.wait(600)
    expect(meteors(rig.started)).toBe(0)
  })

  it('plunges a heavy buffered on the ground before a held jump only at the apex', () => {
    const rig = setup()
    rig.step(['light'])
    rig.step(['heavy'])
    rig.hold('jump')
    rig.step(['jump'])
    while (rig.motor.vy < 0) {
      expect(meteors(rig.started)).toBe(0)
      rig.step()
    }
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
    expect(rig.y()).toBeLessThan(-60)
  })

  it('plays nothing in a hop, but once it falls below the take-off height', () => {
    const rig = setup()
    rig.longJump(30)
    rig.setFloor(400)
    for (let n = 0; n < 300 && !(rig.motor.vy > 0 && rig.y() > -8); n++) rig.step()
    expect(rig.y()).toBeLessThan(0)
    rig.step(['heavy'])
    rig.wait(60)
    expect(rig.started).toEqual([])
    for (let n = 0; n < 300 && rig.y() < 20; n++) rig.step()
    expect(rig.y()).toBeGreaterThanOrEqual(20)
    rig.step(['heavy'])
    rig.wait(STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('plays nothing in a hop that falls below the take-off height after a dash', () => {
    const rig = setup({ airDash: true })
    rig.longJump(30)
    rig.setFloor(400)
    rig.step(['dash'])
    rig.wait(MOTOR.dashMs + 120)
    for (let n = 0; n < 300 && rig.y() < 20; n++) rig.step()
    rig.step(['heavy'])
    rig.wait(100)
    expect(rig.started).toEqual([])
  })

  it('allows the plunge after a hit in the first moments of a held jump', () => {
    const rig = setup()
    rig.hold('jump')
    rig.step(['jump'])
    rig.hurtStep(200)
    rig.hurtStep(100)
    rig.toApex()
    rig.step(['heavy'])
    expect(meteors(rig.started)).toBe(1)
  })

  it('plays at once after walking off a ledge or dropping through a plank', () => {
    const { started, step, wait, lift, airborne } = setup()
    lift(80)
    step()
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(STEP_MS)
    expect(meteors(started)).toBe(1)
  })

  it('waits for the apex after a knockback launch off the ground', () => {
    const rig = setup()
    rig.step()
    rig.motor.vy = -300
    rig.step()
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    rig.toApex()
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('plays nothing after a dash out of a ledge fall until a double jump', () => {
    const rig = setup({ airDash: true, doubleJump: true })
    rig.lift(900)
    rig.step()
    rig.step(['dash'])
    afterDash(rig)
    rig.step(['heavy'])
    rig.wait(100)
    expect(rig.started).toEqual([])
    rig.step(['jump'])
    expect(rig.motor.jumped).toBe(true)
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('counts a double jump as height even after a hop', () => {
    const { started, step, wait, longJump, toApex } = setup({ doubleJump: true })
    longJump(30)
    wait(60)
    step(['jump'])
    wait(100)
    step(['heavy'])
    toApex()
    wait(2 * STEP_MS)
    expect(meteors(started)).toBe(1)
  })

  it('is allowed again after landing from a hop', () => {
    const { started, step, wait, longJump, airborne, toApex } = setup()
    longJump(30)
    wait(800)
    expect(airborne()).toBe(false)
    longJump()
    step(['heavy'])
    toApex()
    wait(2 * STEP_MS)
    expect(meteors(started)).toBe(1)
  })

  it('bounces up to the apex of a full held jump', () => {
    const jump = setup()
    jump.hold('jump')
    jump.step(['jump'])
    let apex = 0
    for (let ms = 0; ms < 900; ms += STEP_MS) {
      jump.step()
      apex = Math.max(apex, -jump.y())
    }
    expect(apex).toBeGreaterThan(80)

    const rig = setup({ doubleJump: true })
    rig.lift(300)
    rig.hold('jump')
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(100)
    const from = rig.y()
    expect(rig.bounce()).toBe(true)
    let top = 0
    for (let ms = 0; ms < 900; ms += STEP_MS) {
      rig.step()
      top = Math.max(top, from - rig.y())
    }
    expect(top).toBeGreaterThan(apex * 0.93)
    expect(top).toBeLessThan(apex * 1.07)
  })

  it('allows no second plunge after a bounce without the card', () => {
    const { started, step, wait, bounce, airborne, longJump, toApex } = setup()
    longJump()
    step(['heavy'])
    toApex()
    wait(100)
    expect(bounce(false)).toBe(true)
    wait(150)
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(50)
    expect(meteors(started)).toBe(1)
  })
})

describe('air heavy waiting for the apex', () => {
  it('lets an air jump cancel the pending heavy and queues again for the second apex', () => {
    const rig = setup({ doubleJump: true })
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    rig.step(['jump'])
    expect(rig.motor.jumped).toBe(true)
    expect(rig.motor.plungeUsed).toBe(false)
    expect(rig.controls.heavyPending()).toBe(false)
    // The first apex passes without a plunge.
    rig.wait(20)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    while (rig.motor.vy < 0) {
      expect(meteors(rig.started)).toBe(0)
      rig.step()
    }
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
    rig.wait(100)
    expect(rig.bounce()).toBe(true)
    expect(availableJump(rig.motor, rig.motorEnv)).toBeNull()
  })

  // Jumps from the floor with the key held, then lets the mage rise a little.
  function jumpUp(rig: ReturnType<typeof setup>) {
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(HOP_MAX_HOLD_MS + 20)
  }

  it('plays nothing after an air dash until a double jump arms it again', () => {
    const rig = setup({ airDash: true, doubleJump: true })
    jumpUp(rig)
    rig.step(['dash'])
    afterDash(rig)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(false)
    rig.wait(100)
    expect(rig.started).toEqual([])
    rig.step(['jump'])
    expect(rig.motor.jumped).toBe(true)
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('drops a pending heavy when a dash starts and disarms until a double jump', () => {
    const rig = setup({ airDash: true, doubleJump: true })
    jumpUp(rig)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    rig.step(['dash'])
    expect(rig.controls.heavyPending()).toBe(false)
    afterDash(rig)
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(300)
    expect(rig.started).toEqual([])
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('does not refund a plunge of Technical Replicates after a dash between bounces', () => {
    const rig = setup({ airDash: true, doubleJump: true })
    rig.lift(900)
    rig.hold('jump')
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(100)
    rig.bounce(true)
    expect(rig.motor.plungeChain).toBe(1)
    rig.wait(150)
    rig.step(['dash'])
    afterDash(rig)
    expect(rig.motor.plungeChain).toBe(1)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(false)
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(100)
    expect(rig.motor.plungeChain).toBe(2)
  })

  it('keeps a heavy pressed during a dash as the dash heavy', () => {
    const rig = setup({ airDash: true, doubleJump: true })
    rig.lift(400)
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(20)
    rig.step(['dash'])
    rig.step(['heavy'])
    rig.wait(MOTOR.dashMs + 120)
    expect(rig.started).toEqual([{ name: 'comet', variant: 'dash' }])
  })

  it('waits for the apex of the double jump when pressed after it', () => {
    const rig = setup({ doubleJump: true })
    rig.longJump()
    rig.toApex()
    rig.wait(40)
    rig.step(['jump'])
    expect(rig.motor.jumped).toBe(true)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    while (rig.motor.vy < 0) {
      expect(meteors(rig.started)).toBe(0)
      rig.step()
    }
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(1)
  })

  it('does not give a fresh double jump with the bounce when it was used before the plunge', () => {
    const rig = setup({ doubleJump: true })
    rig.longJump()
    rig.step(['jump'])
    rig.step(['heavy'])
    rig.toApex()
    rig.wait(100)
    expect(rig.bounce()).toBe(true)
    expect(availableJump(rig.motor, rig.motorEnv)).toBeNull()
    rig.step(['jump'])
    expect(rig.motor.jumped).toBe(false)
  })
})

describe('pogo card', () => {
  // Jumps, then plunges and bounces `count` times. Each press comes while rising, so the plunge starts
  // at the apex, hits 100 ms later, and the next press comes 150 ms into the bounce.
  function chain(count: number) {
    const rig = setup()
    rig.longJump()
    for (let i = 0; i < count; i++) {
      rig.step(['heavy'])
      rig.toApex()
      rig.wait(100)
      rig.bounce(true)
      rig.wait(150)
    }
    return rig
  }

  it('allows PLUNGE_CHAIN_MAX plunges in one airtime, then none until landing', () => {
    expect(PLUNGE_CHAIN_MAX).toBe(3)
    const { started, step, wait, motor, airborne } = chain(PLUNGE_CHAIN_MAX)
    expect(meteors(started)).toBe(PLUNGE_CHAIN_MAX)
    expect(airborne()).toBe(true)
    step(['heavy'])
    wait(50)
    expect(meteors(started)).toBe(PLUNGE_CHAIN_MAX)
    expect(motor.plungeChain).toBe(PLUNGE_CHAIN_MAX)
  })

  it('starts the next plunge only at the apex of the bounce', () => {
    const rig = chain(1)
    expect(meteors(rig.started)).toBe(1)
    rig.step(['heavy'])
    expect(rig.controls.heavyPending()).toBe(true)
    while (rig.motor.vy < 0) {
      expect(meteors(rig.started)).toBe(1)
      rig.step()
    }
    rig.wait(2 * STEP_MS)
    expect(meteors(rig.started)).toBe(2)
  })

  it('bounces every plunge to the full jump speed', () => {
    const { motor, step, wait, bounce, longJump, toApex } = setup()
    longJump()
    for (let i = 0; i < PLUNGE_CHAIN_MAX; i++) {
      step(['heavy'])
      toApex()
      wait(100)
      bounce(true)
      expect(motor.vy).toBe(-JUMP_VELOCITY)
      wait(150)
    }
  })

  it('resets the count on landing', () => {
    const { started, step, wait, bounce, motor, airborne, longJump, toApex } = chain(PLUNGE_CHAIN_MAX)
    wait(1500)
    expect(airborne()).toBe(false)
    expect(motor.plungeChain).toBe(0)
    longJump()
    for (let i = 0; i < PLUNGE_CHAIN_MAX; i++) {
      step(['heavy'])
      toApex()
      wait(100)
      bounce(true)
      wait(150)
    }
    expect(meteors(started)).toBe(2 * PLUNGE_CHAIN_MAX)
  })

  it('gives back no jump with a chained bounce', () => {
    const { motor, motorEnv } = chain(2)
    expect(motor.jumpsUsed).toBe(1)
    expect(motor.coyoteMs).toBe(0)
    expect(availableJump(motor, motorEnv)).toBeNull()
  })
})

describe('dash attacks', () => {
  it('carry none of the dash speed into the attack', () => {
    const rig = setup()
    const run = runSpeed(rig.motorEnv)
    rig.hold('right')
    rig.step(['dash'])
    rig.wait(30)
    rig.step(['light'])
    while (rig.motor.dashMs > 0) rig.step()
    rig.step()
    expect(rig.started.map((s) => s.variant)).toEqual(['dash'])
    expect(rig.motor.vx).toBeLessThanOrEqual(run)

    const still = setup()
    still.hold('right')
    still.step(['dash'])
    still.wait(30)
    still.hold()
    still.step(['light'])
    while (still.motor.dashMs > 0) still.step()
    still.step()
    const x = still.x()
    still.wait(400)
    expect(still.motor.vx).toBe(0)
    expect(still.x()).toBeCloseTo(x)
  })

  it('still start as attacks', () => {
    const light = setup()
    light.step(['dash'])
    light.step(['light'])
    light.wait(MOTOR.dashMs + 2 * STEP_MS)
    expect(light.started).toEqual([{ name: 'lunge', variant: 'dash' }])
    const heavy = setup()
    heavy.step(['dash', 'heavy'])
    heavy.wait(MOTOR.dashMs + 2 * STEP_MS)
    expect(heavy.started).toEqual([{ name: 'comet', variant: 'dash' }])
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
        expect(motor.vx).toBeLessThanOrEqual(MOTOR.runSpeed * 0.5 + 1)
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

  it('does not move the mage when no direction is held, on the ground or in the air', () => {
    const rig = setup()
    for (const press of ['light', 'light', 'light', 'heavy'] as Action[]) {
      rig.step([press])
      rig.wait(500)
    }
    expect(rig.x()).toBe(0)
    rig.hold('jump')
    rig.step(['jump'])
    rig.wait(200)
    rig.hold()
    rig.step(['light'])
    rig.wait(400)
    rig.step(['heavy'])
    rig.wait(400)
    expect(rig.x()).toBe(0)
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
