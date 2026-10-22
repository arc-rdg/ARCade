import { TILE } from '../../contracts/constants'

// Feel constants in world units (1 tile = TILE units) and seconds.
export const MOTOR = {
  runSpeed: 210,
  groundAccel: 2800,
  groundDecel: 3600,
  airAccel: 2000,
  gravity: 1900,
  jumpHeightTiles: 3.5,
  apexHangSpeed: 60,
  apexHangGravity: 0.5,
  jumpCut: 0.4,
  fastFallGravity: 1.6,
  terminalFall: 720,
  coyoteMs: 90,
  jumpBufferMs: 120,
  dashBufferMs: 100,
  dashMs: 150,
  dashSpeedFactor: 3.2,
  dashIframesMs: 120,
  glideFallSpeed: 90,
} as const

// v = sqrt(2 g h) gives the apex height without the small extra from the apex hang.
export const JUMP_VELOCITY = Math.sqrt(2 * MOTOR.gravity * MOTOR.jumpHeightTiles * TILE)

// Air heavies that may hit in one airtime with the Technical Replicates card. Each bounce is a full
// jump high. Without the card the first bounce ends the plunges until the next landing.
export const PLUNGE_CHAIN_MAX = 3
// A jump released before it was held this long is a hop: the cut applied early and the mage gets no
// air heavy until the next landing. Held this long it is about 2 tiles high, enough to fall from.
export const HOP_MAX_HOLD_MS = 120

export type MotorAction = 'left' | 'right' | 'down' | 'jump' | 'dash'

// An InputFrame fits as is. The motor reads only the MotorAction entries.
export interface MotorInput {
  held: ReadonlySet<string>
  pressed: ReadonlySet<string>
  released: ReadonlySet<string>
}

export interface MotorEnv {
  grounded: boolean
  stats: { moveSpeed: number; dashCooldownMs: number }
  mechanics: { doubleJump: boolean; airDash: boolean; hatGlide: boolean; noJump?: boolean; infiniteAirDash?: boolean }
  // Multiplies the horizontal target speed, for example while attacking on the ground. Default 1.
  speedScale?: number
  // Blocks starting jumps and dashes and turning around. Jump and dash presses still fill their buffers.
  actionsLocked?: boolean
}

export interface MotorState {
  vx: number
  vy: number
  facing: 1 | -1
  // Remaining times in ms.
  coyoteMs: number
  jumpBufferMs: number
  dashBufferMs: number
  dashMs: number
  dashCooldownMs: number
  dashIframesMs: number
  dashDir: 1 | -1
  jumpsUsed: number
  airDashUsed: boolean
  // True from a jump until jump is released, for the apex hang and the jump cut.
  jumpHeld: boolean
  // How long jump has been held since the jump started, and whether it was let go before
  // HOP_MAX_HOLD_MS. A hop refuses the air heavy until the next landing.
  jumpHeldMs: number
  hopped: boolean
  // An air heavy started in this airtime, so no other may start before the mage lands
  // or is teleported. The jumpsUsed and airDashUsed it started with come back after its bounce.
  plungeUsed: boolean
  plungeJumpsUsed: number
  plungeAirDashUsed: boolean
  // Air heavies started in this airtime, and the place of the last one in that count (1 for the
  // first). A bounce off the floor continues the airtime, so it restores plungeChain from plungeLink.
  plungeChain: number
  plungeLink: number
  // Set for the step in which the move started, for animation and events.
  jumped: boolean
  dashed: boolean
}

export function createMotorState(facing: 1 | -1 = 1): MotorState {
  return {
    vx: 0,
    vy: 0,
    facing,
    coyoteMs: 0,
    jumpBufferMs: 0,
    dashBufferMs: 0,
    dashMs: 0,
    dashCooldownMs: 0,
    dashIframesMs: 0,
    dashDir: 1,
    jumpsUsed: 0,
    airDashUsed: false,
    jumpHeld: false,
    jumpHeldMs: 0,
    hopped: false,
    plungeUsed: false,
    plungeJumpsUsed: 0,
    plungeAirDashUsed: false,
    plungeChain: 0,
    plungeLink: 0,
    jumped: false,
    dashed: false,
  }
}

export const EMPTY_MOTOR_INPUT: MotorInput = { held: new Set(), pressed: new Set(), released: new Set() }

export function runSpeed(env: MotorEnv): number {
  return MOTOR.runSpeed * env.stats.moveSpeed
}

// A just-started jump can still report the ground for one step, so rising never counts as grounded.
function onGround(state: MotorState, env: MotorEnv): boolean {
  return env.grounded && state.vy >= 0
}

export type JumpKind = 'ground' | 'air' | null

// Which jump a press would start now. The player uses it to decide whether a jump may cancel an attack.
export function availableJump(state: MotorState, env: MotorEnv): JumpKind {
  // Deprecated jump(): no jump of any kind. The stretch builds bridges and hoists the mage instead.
  if (env.mechanics.noJump) return null
  const grounded = onGround(state, env)
  if (grounded || state.coyoteMs > 0) return 'ground'
  if (env.mechanics.doubleJump && state.jumpsUsed < 2) return 'air'
  return null
}

export function canDash(state: MotorState, env: MotorEnv): boolean {
  if (state.dashMs > 0 || state.dashCooldownMs > 0) return false
  if (onGround(state, env) || state.coyoteMs > 0) return true
  // Infinite Scroll: dashes in mid-air as often as the cooldown allows.
  if (env.mechanics.infiniteAirDash) return true
  return env.mechanics.airDash && !state.airDashUsed
}

const probeState = createMotorState()
const probeEnv: MotorEnv = {
  grounded: false,
  stats: { moveSpeed: 1, dashCooldownMs: 0 },
  mechanics: { doubleJump: false, airDash: false, hatGlide: false },
}

// The move a step with this input would start if no attack locked the motor, or null. It runs the
// step on a scratch state, so it always agrees with stepMotor. The player uses it to let a jump or a
// dash end any attack.
export function moveStarts(state: MotorState, input: MotorInput, env: MotorEnv, dtMs: number): 'jump' | 'dash' | null {
  if (!input.pressed.has('jump') && !input.pressed.has('dash') && state.jumpBufferMs <= 0 && state.dashBufferMs <= 0) return null
  Object.assign(probeEnv, env)
  probeEnv.actionsLocked = false
  stepMotor(state, input, probeEnv, dtMs, probeState)
  if (probeState.dashed) return 'dash'
  return probeState.jumped ? 'jump' : null
}

// A dash attack took over from the dash. It keeps none of the dash speed: the mage runs at the speed
// of the left or right key held now, or stands still without one.
export function dashAttackStarted(state: MotorState, held: ReadonlySet<string>, env: MotorEnv): void {
  const dir = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
  state.vx = dir * runSpeed(env)
  state.dashMs = 0
}

// An air heavy started. Call once per air heavy.
export function startPlunge(state: MotorState): void {
  state.plungeUsed = true
  state.plungeJumpsUsed = state.jumpsUsed
  state.plungeAirDashUsed = state.airDashUsed
  state.plungeChain++
  state.plungeLink = state.plungeChain
}

// The air heavy bounced the mage up, and the caller sets the velocity to a full jump's. The bounce
// continues the airtime the plunge started in, also when the landing ring bounced it off the floor:
// the jumps and the air dash are as they were before the plunge and the coyote time of that
// landing is gone. Without Technical Replicates no second air heavy may start before the next
// landing. With it (`chains`) the next one may, up to PLUNGE_CHAIN_MAX per airtime.
export function plungeBounced(state: MotorState, chains = false): void {
  state.plungeChain = state.plungeLink
  state.plungeUsed = !chains || state.plungeChain >= PLUNGE_CHAIN_MAX
  state.jumpsUsed = state.plungeJumpsUsed
  state.airDashUsed = state.plungeAirDashUsed
  state.coyoteMs = 0
  state.jumpHeld = false
  state.hopped = false
}

// A plain heavy press in the air plays the air heavy, which only one may do per airtime and not
// after a hop. The press then does nothing. Up and dash heavies are other variants and stay free.
export function airHeavyRefused(state: MotorState, airborne: boolean, up: boolean, dashing: boolean): boolean {
  return (state.plungeUsed || state.hopped) && airborne && !up && !dashing
}

// The pointer counts as in use for this long after it last moved or a mouse button went down. The
// attacks follow the cursor, and the weapon cursor stays visible, for exactly this long.
export const AIM_RECENT_MS = 10000
// A cursor this close to the mage (world units, horizontally) does not turn it.
export const AIM_DEAD_ZONE = 6

// The side a new attack faces. With a recently used pointer that is the side of the cursor, so the
// mage can swing one way while running the other. Otherwise, or with the cursor over the mage, the
// current facing stays.
export function aimFacing(cursorDx: number, pointerRecent: boolean, facing: 1 | -1): 1 | -1 {
  if (!pointerRecent || Math.abs(cursorDx) <= AIM_DEAD_ZONE) return facing
  return cursorDx > 0 ? 1 : -1
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta)
  return Math.max(target, value - maxDelta)
}

// Pass `out` (which may be `state` itself) to write the result into an existing object, so the
// per-step loop allocates nothing.
export function stepMotor(state: MotorState, input: MotorInput, env: MotorEnv, dtMs: number, out?: MotorState): MotorState {
  const dt = dtMs / 1000
  const s: MotorState = out ? Object.assign(out, state) : { ...state }
  s.jumped = false
  s.dashed = false
  const locked = env.actionsLocked ?? false
  const run = runSpeed(env)
  const grounded = onGround(s, env)

  s.jumpBufferMs = Math.max(0, s.jumpBufferMs - dtMs)
  s.dashBufferMs = Math.max(0, s.dashBufferMs - dtMs)
  s.dashCooldownMs = Math.max(0, s.dashCooldownMs - dtMs)
  s.dashIframesMs = Math.max(0, s.dashIframesMs - dtMs)
  if (grounded) {
    s.coyoteMs = MOTOR.coyoteMs
    s.jumpsUsed = 0
    s.airDashUsed = false
    s.plungeUsed = false
    s.plungeChain = 0
    s.hopped = false
    if (s.vy > 0) s.vy = 0
  } else {
    s.coyoteMs = Math.max(0, s.coyoteMs - dtMs)
  }

  if (input.pressed.has('jump')) s.jumpBufferMs = MOTOR.jumpBufferMs

  const dir = (input.held.has('right') ? 1 : 0) - (input.held.has('left') ? 1 : 0)

  if (input.pressed.has('dash')) s.dashBufferMs = MOTOR.dashBufferMs
  if (s.dashBufferMs > 0 && !locked && canDash(s, env)) {
    s.dashBufferMs = 0
    if (!grounded && s.coyoteMs <= 0) s.airDashUsed = true
    s.dashDir = dir !== 0 ? (dir as 1 | -1) : s.facing
    s.facing = s.dashDir
    s.dashMs = MOTOR.dashMs
    s.dashIframesMs = MOTOR.dashIframesMs
    s.dashCooldownMs = env.stats.dashCooldownMs
    s.jumpHeld = false
    s.dashed = true
  }

  const wasDashing = s.dashMs > 0
  if (wasDashing) s.dashMs = Math.max(0, s.dashMs - dtMs)

  // A jump ends a dash early, so dash into jump keeps the timing tight.
  if (s.jumpBufferMs > 0 && !locked) {
    const kind = availableJump(s, env)
    if (kind) {
      s.vy = -JUMP_VELOCITY
      s.jumpBufferMs = 0
      s.coyoteMs = 0
      s.jumpHeld = true
      // Only a jump off the ground can be a hop. An air jump adds height to an airtime already there.
      s.jumpHeldMs = kind === 'ground' ? 0 : HOP_MAX_HOLD_MS
      s.hopped = false
      s.jumped = true
      if (s.dashMs > 0) {
        s.dashMs = 0
        s.vx = s.dashDir * run
      }
      if (kind === 'ground') s.jumpsUsed = 1
      else s.jumpsUsed = 2
    }
  }

  if (s.jumpHeld && !input.held.has('jump')) {
    if (s.vy < 0) s.vy *= MOTOR.jumpCut
    if (s.jumpHeldMs < HOP_MAX_HOLD_MS) s.hopped = true
    s.jumpHeld = false
  } else if (s.jumpHeld) s.jumpHeldMs += dtMs

  if (s.dashMs > 0) {
    s.vx = s.dashDir * run * MOTOR.dashSpeedFactor
    s.vy = 0
    return s
  }
  if (wasDashing) s.vx = s.dashDir * run

  if (dir !== 0 && !locked) s.facing = dir as 1 | -1

  const target = dir * run * (env.speedScale ?? 1)
  const groundedNow = grounded && !s.jumped
  if (groundedNow) {
    if (dir !== 0 && Math.sign(s.vx) === -dir) s.vx = 0
    const speedingUp = dir !== 0 && Math.abs(s.vx) < Math.abs(target)
    s.vx = approach(s.vx, target, (speedingUp ? MOTOR.groundAccel : MOTOR.groundDecel) * dt)
  } else {
    s.vx = approach(s.vx, target, MOTOR.airAccel * dt)
  }

  let gravity = MOTOR.gravity
  if (s.jumpHeld && Math.abs(s.vy) < MOTOR.apexHangSpeed) gravity *= MOTOR.apexHangGravity
  if (!groundedNow && input.held.has('down')) gravity *= MOTOR.fastFallGravity
  s.vy += gravity * dt

  let maxFall: number = MOTOR.terminalFall
  if (env.mechanics.hatGlide && !groundedNow && input.held.has('jump') && s.vy > 0) maxFall = MOTOR.glideFallSpeed
  if (s.vy > maxFall) s.vy = maxFall
  return s
}
