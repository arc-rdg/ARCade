import type { PlayerWeaponId } from '../../contracts/progression'

// Every mouse cursor the game draws. 'none' hides the cursor.
export type CursorKind = 'arrow' | 'sword' | 'starCross' | 'cookie' | 'glove' | 'disabled' | 'openHand' | 'closedHand' | 'magnifier' | 'none'

// Light weapons that shoot at the cursor. Every other light weapon swings in melee.
const RANGED_LIGHT: ReadonlySet<PlayerWeaponId> = new Set<PlayerWeaponId>(['wand', 'pipettePistol', 'arcitect', 'arcCommander'])

// The cursor of a light weapon. Only the light weapon counts, a heavy one never changes it.
export function weaponCursor(light: PlayerWeaponId): 'sword' | 'starCross' {
  return RANGED_LIGHT.has(light) ? 'starCross' : 'sword'
}

export interface CursorState {
  // A pause, an overlay or an end screen is up. Its widgets set their own cursors where they need one.
  menu: boolean
  // The cookie banner is up and blocks attacks.
  cookie: boolean
  // The pointer was used within AIM_RECENT_MS, so the attacks follow the cursor.
  aimActive: boolean
  light: PlayerWeaponId | null
}

// What the cursor shows when nothing under it asks for another. Menus always show the arrow. During
// play the cursor is shown exactly while the attacks aim at it, and hides when the mouse rests.
export function cursorFor(state: CursorState): CursorKind {
  if (state.menu || !state.light) return 'arrow'
  if (!state.aimActive) return 'none'
  return state.cookie ? 'cookie' : weaponCursor(state.light)
}
