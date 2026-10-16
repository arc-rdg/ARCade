import { AIM_DEAD_ZONE, EMPTY_MOTOR_INPUT, aimFacing, airHeavyRefused, moveStarts, startPlunge, stepMotor } from '../../model/input/motor'
import type { MotorEnv, MotorInput, MotorState } from '../../model/input/motor'
import type { AttackInfo, AttackMachine, AttackStepEnv } from './attacks'

// An attack pressed this long after a dash ended still plays the dash variant.
export const DASH_ATTACK_GRACE_MS = 80
// The run speed share left while a move starts and strikes on the ground. Once the move may be
// cancelled the mage runs at full speed again.
export const ATTACK_GROUND_SPEED = 0.5
// A jump, dash or attack pressed in the last stretch of a flinch or stun fires on the first free step.
export const CARRY_WINDOW_MS = 120
// How long a move's lunge pushes at the start of its active phase.
export const LUNGE_MS = 60

const NO_HELD: ReadonlySet<string> = new Set()

// The horizontal speed a move's lunge leaves the mage with. The lunge pushes only while left or right
// is held, so an attack without a direction stays in place: on the ground it stops a walk, in the
// air it keeps the air speed. The lunge never slows a mage who already runs faster that way.
export function lungeVelocity(lunge: number, facing: 1 | -1, leftHeld: boolean, rightHeld: boolean, grounded: boolean, vx: number): number {
  if (leftHeld !== rightHeld) return facing * Math.max(lunge, facing * vx)
  return grounded ? 0 : vx
}

export interface ControlPresses {
  light: boolean
  heavy: boolean
  // Up held and down not held.
  up: boolean
}

export interface Controls {
  // One fixed step of the attack machine and then the motor. `input` is the live input, which the
  // motor ignores while not controllable. Writes the motor state in place. With `attacksBlocked` the
  // light and heavy presses are dropped, not buffered, so they cannot fire once the block ends.
  // `controlInMs` is how long the mage stays uncontrollable: presses made in its last
  // CARRY_WINDOW_MS wait and fire on the first controllable step.
  step(
    input: MotorInput,
    presses: ControlPresses,
    controllable: boolean,
    attackSpeed: number,
    dtMs: number,
    attacksBlocked?: boolean,
    controlInMs?: number,
  ): void
  // Turns the mage towards the cursor when an attack starts. `cursorDx` is the cursor x minus the
  // mage x. Does nothing unless the pointer was used lately, so keyboard play and the trader AI keep
  // the held direction.
  faceCursor(cursorDx: number, pointerRecent: boolean): void
  // A dash variant took over the dash, so a later press plays the normal move again.
  endDashGrace(): void
}

// Ties the attack machine to the motor. A jump or dash that can start always starts on the step it
// is pressed and ends the attack, so no button waits on another. Only the dash cooldown and the jump
// rules (ground, coyote time, air jumps) hold them back. An attack pressed during a dash waits in the
// buffer and plays the dash variant when the dash ends.
export function createControls(motor: MotorState, motorEnv: MotorEnv, attacks: AttackMachine): Controls {
  let sinceDashMs = Infinity
  // The attack seen last step. Each started move has a fresh info object, so a new one means a start.
  let seen: Readonly<AttackInfo> | null = null
  const attackPressed = { light: false, heavy: false }
  const attackEnv: AttackStepEnv = { grounded: false, attackSpeed: 1, canStart: false, dashing: false, holdBuffer: false, up: false }
  // What the motor reads during an attack lock: no direction held, while jump and dash presses
  // still fill their buffers.
  const lockedInput: MotorInput = { held: NO_HELD, pressed: NO_HELD, released: NO_HELD }
  // Presses made just before control returns, merged into the first controllable step.
  const carried = new Set<string>()
  const mergedPressed = new Set<string>()
  const mergedInput: MotorInput = { held: NO_HELD, pressed: mergedPressed, released: NO_HELD }
  const mergedPresses: ControlPresses = { light: false, heavy: false, up: false }
  let carriedLight = false
  let carriedHeavy = false
  let lungeMs = 0
  let lungeSeen: Readonly<AttackInfo> | null = null
  let wasActive = false
  // The attack started towards a recently used cursor, so its facing holds until the move ends.
  let aimed = false

  return {
    step(live, livePresses, controllable, attackSpeed, dtMs, attacksBlocked = false, controlInMs = Infinity) {
      let input = live
      let presses = livePresses
      if (!controllable) {
        if (controlInMs <= CARRY_WINDOW_MS) {
          if (live.pressed.has('jump')) carried.add('jump')
          if (live.pressed.has('dash')) carried.add('dash')
          carriedLight ||= livePresses.light
          carriedHeavy ||= livePresses.heavy
        } else {
          carried.clear()
          carriedLight = carriedHeavy = false
        }
        input = EMPTY_MOTOR_INPUT
      } else if (carried.size > 0 || carriedLight || carriedHeavy) {
        mergedPressed.clear()
        for (const action of live.pressed) mergedPressed.add(action)
        for (const action of carried) mergedPressed.add(action)
        mergedInput.held = live.held
        mergedInput.released = live.released
        mergedPresses.light = livePresses.light || carriedLight
        mergedPresses.heavy = livePresses.heavy || carriedHeavy
        mergedPresses.up = livePresses.up
        input = mergedInput
        presses = mergedPresses
        carried.clear()
        carriedLight = carriedHeavy = false
      }
      const grounded = motorEnv.grounded
      const move = controllable ? moveStarts(motor, input, motorEnv, dtMs) : null
      const dashRuns = motor.dashMs > 0 || move === 'dash'
      // A just-started jump can still report the ground, so a rising mage plays the air variants.
      attackEnv.grounded = grounded && motor.vy >= 0
      attackEnv.attackSpeed = attackSpeed
      attackEnv.canStart = controllable && move === null && !dashRuns
      attackEnv.dashing = dashRuns || sinceDashMs < DASH_ATTACK_GRACE_MS
      attackEnv.holdBuffer = dashRuns
      attackEnv.up = presses.up
      attackPressed.light = controllable && !attacksBlocked && presses.light
      // A second air heavy before landing is dropped, not buffered, so it cannot slam on the landing.
      attackPressed.heavy =
        controllable && !attacksBlocked && presses.heavy && !airHeavyRefused(motor, !attackEnv.grounded, presses.up, attackEnv.dashing)
      attacks.step(dtMs, attackPressed, attackEnv)
      const current = attacks.current()
      if (current !== seen) {
        seen = current
        if (current?.variant === 'air') startPlunge(motor)
      }
      // After the attack step, so a plunge landing on this step still fires its landing hit. Hits
      // already spawned stay.
      if (move) attacks.cancel()

      let motorInput = input
      if (attacks.lockRemainingMs() > 0 && controllable) {
        lockedInput.pressed = input.pressed
        lockedInput.released = input.released
        motorInput = lockedInput
      }
      motorEnv.actionsLocked = attacks.isLocked()
      const phase = attacks.phase()
      motorEnv.speedScale = phase !== 'idle' && !attacks.canCancel() && grounded ? ATTACK_GROUND_SPEED : 1
      // The move keeps the facing it started with. After an aimed start that lasts until the move
      // ends, otherwise the held direction turns the mage once the cancel window opens.
      const facing = motor.facing
      stepMotor(motor, motorInput, motorEnv, dtMs, motor)
      if (phase === 'idle') aimed = false
      else if ((aimed || !attacks.canCancel()) && !motor.dashed && !motor.jumped) motor.facing = facing

      // The lunge starts with the active phase. A single set would be gone after a few steps of
      // ground friction, so it pushes for LUNGE_MS.
      const active = phase === 'active'
      if (active && !wasActive && current?.move.lunge) {
        lungeMs = LUNGE_MS
        lungeSeen = current
      }
      wasActive = active
      if (lungeMs > 0) {
        if (active && current === lungeSeen && current?.move.lunge && motor.dashMs <= 0) {
          motor.vx = lungeVelocity(current.move.lunge, motor.facing, input.held.has('left'), input.held.has('right'), grounded, motor.vx)
          lungeMs -= dtMs
        } else lungeMs = 0
      }
      if (motor.dashMs > 0) sinceDashMs = 0
      else sinceDashMs += dtMs
    },
    faceCursor(cursorDx, pointerRecent) {
      aimed = pointerRecent && Math.abs(cursorDx) > AIM_DEAD_ZONE
      motor.facing = aimFacing(cursorDx, pointerRecent, motor.facing)
    },
    endDashGrace() {
      sinceDashMs = Infinity
    },
  }
}
