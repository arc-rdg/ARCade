// The wind-up poses of the light attacks. A light attack has no danger zone, so the body shows it
// is coming: one pose per kind, formed quickly with an ease-out and held until the attack fires.
// Plain data and maths, the actor turns it into limb rotations and a body scale.

export type PoseKind = 'none' | 'sweep' | 'charge' | 'fan' | 'rain' | 'summon'

export interface Pose {
  kind: PoseKind
  // 0 to 1, how far the pose has formed.
  t: number
}

export function createPose(): Pose {
  return { kind: 'none', t: 0 }
}

export function clearPose(pose: Pose): void {
  pose.kind = 'none'
  pose.t = 0
}

// The pose is formed after this share of the wind-up, but never faster than POSE_MIN_MS and
// never slower than POSE_MAX_MS, so it is formed early and held.
const POSE_SHARE = 0.4
export const POSE_MIN_MS = 80
export const POSE_MAX_MS = 120

export function poseFormMs(windupMs: number): number {
  return Math.min(POSE_MAX_MS, Math.max(POSE_MIN_MS, windupMs * POSE_SHARE))
}

// Ease-out: fast at first, then settling.
export function poseProgress(elapsedMs: number, windupMs: number): number {
  const u = Math.min(1, Math.max(0, elapsedMs / poseFormMs(windupMs)))
  return 1 - (1 - u) * (1 - u)
}

// Body scale of a pose, multiplied onto the base scale.
export const CHARGE_CROUCH = 0.88
export const FAN_PUFF = 1.08

export function poseScale(pose: Pose, out: { x: number; y: number }): void {
  out.x = 1
  out.y = 1
  if (pose.kind === 'charge') {
    out.y = 1 - (1 - CHARGE_CROUCH) * pose.t
    out.x = 1 + 0.05 * pose.t
  } else if (pose.kind === 'fan') {
    out.x = out.y = 1 + (FAN_PUFF - 1) * pose.t
  }
}

// How far an arm has turned from hanging down, in radians, for a pose. Positive turns the hand
// toward the left on screen. `side` is -1 or 1 for the arm in front of or behind a boss that
// faces right as drawn (already flipped for the facing), `facing` is the way the boss looks.
// Null leaves the limb to the generic wind-up.
export function poseArmAngle(pose: Pose, side: number, facing: number): number | null {
  switch (pose.kind) {
    // Both arms cocked back behind the body.
    case 'sweep':
      return facing * 1.3 * pose.t
    // Both arms straight up.
    case 'rain':
      return side === 0 ? null : -side * Math.PI * pose.t
    // Both arms spread wide.
    case 'summon':
      return side === 0 ? null : -side * (Math.PI / 2 + 0.1) * pose.t
    default:
      return null
  }
}
