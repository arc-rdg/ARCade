import { AIM_DEAD_ZONE, EMPTY_MOTOR_INPUT, MOTOR, aimFacing, airHeavyVerdict, moveStarts, startPlunge, stepMotor } from '../../model/input/motor'
import type { MotorEnv, MotorInput, MotorState } from '../../model/input/motor'
import type { AttackInfo, AttackMachine, AttackStepEnv } from './attacks'

// An attack pressed this long after a dash ended still plays the dash variant.
export const DASH_ATTACK_GRACE_MS = 80
// The run speed share left while a move starts and strikes on the ground. Once the move may be
// cancelled the mage runs at full speed again.
export const ATTACK_GROUND_SPEED = 0.5
// A jump, dash or attack pressed in the last stretch of a flinch or stun fires on the first free step.
export const CARRY_WINDOW_MS = 120

const NO_HELD: ReadonlySet<string> = new Set()

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
  // An air heavy was pressed on the way up and waits for the apex. The player shows the heavy's
  // wind-up pose meanwhile.
  heavyPending(): boolean
  // Drops a pending air heavy, for a teleport.
  cancelPending(): void
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
  // The attack started towards a recently used cursor, so its facing holds until the move ends.
  let aimed = false
  // The air heavy waiting for the apex. It starts on the first step the mage falls, if still allowed.
  let pendingHeavy = false

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
      // An air jump or a dash ends the wait and leaves the plunge unused, so a new heavy press queues it
      // again: for the apex of that jump, or after the dash.
      if (pendingHeavy && move !== null) pendingHeavy = false
      // A just-started jump can still report the ground, so a rising mage plays the air variants.
      attackEnv.grounded = grounded && motor.vy >= 0
      attackEnv.attackSpeed = attackSpeed
      attackEnv.canStart = controllable && move === null && !dashRuns
      attackEnv.dashing = dashRuns || sinceDashMs < DASH_ATTACK_GRACE_MS
      attackEnv.holdBuffer = dashRuns
      attackEnv.up = presses.up
      attackPressed.light = controllable && !attacksBlocked && presses.light
      // The attack machine asks at the moment a heavy would start in the air, also for a press that
      // waited in the buffer. A second air heavy or one after a hop is dropped, so it cannot slam on
      // the landing. While a held jump may still turn out to be a hop the heavy waits.
      // A jump this step or the first airborne step still arms inside the motor step, so a press
      // there waits for the next step instead of being refused on the old state.
      const verdict = airHeavyVerdict(motor, move === 'jump' || (!grounded && motor.coyoteMs >= MOTOR.coyoteMs))
      attackEnv.airHeavy = verdict
      // A pending heavy ends with the landing, a dash or a refusal (a hop, or the plunge used up). It
      // starts on the first step it is allowed, which is past the apex.
      const startPending = pendingHeavy && verdict === 'allow' && !attackEnv.grounded && !dashRuns
      if (pendingHeavy && (verdict === 'refuse' || attackEnv.grounded || dashRuns || attacksBlocked || !controllable)) pendingHeavy = false
      attackPressed.heavy = controllable && !attacksBlocked && (presses.heavy || startPending)
      if (startPending) pendingHeavy = false
      attacks.step(dtMs, attackPressed, attackEnv)
      // A heavy the machine took out of its buffer while the mage rises waits for the apex too.
      if (attacks.takeDeferredHeavy() && controllable) pendingHeavy = true
      const current = attacks.current()
      if (current !== seen) {
        seen = current
        if (current?.variant === 'air') startPlunge(motor)
        // Any other attack that starts replaces the pending heavy.
        else if (current) pendingHeavy = false
      }
      // After the attack step, so a plunge landing on this step still fires its landing hit. Hits
      // already spawned stay.
      if (move) attacks.cancel()

      // Losing control ends the jump hold without making a hop, so a hit keeps the plunge available.
      if (!controllable) {
        motor.jumpHeld = false
      }
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
    heavyPending: () => pendingHeavy,
    cancelPending() {
      pendingHeavy = false
    },
  }
}
