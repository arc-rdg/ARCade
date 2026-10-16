import type { PlayerWeaponId } from '../../contracts/progression'
import { cursorFor } from '../../model/input/cursor'
import type { CursorController } from './controller'

// Decides which cursor the screen shows. The scenes report what changed, the director works out the
// kind and the controller writes it only when it differs from the last one.
export class CursorDirector {
  private controller: CursorController | null = null
  private light: PlayerWeaponId | null = null
  // The gameplay scene holds the world: a pause or an overlay is up.
  private held = true
  // The death or victory screen is up.
  private end = false
  private cookie = false
  private aimActive = false

  bind(controller: CursorController | null): void {
    this.controller = controller
    this.apply()
  }

  // The light weapon in the mage's hand. Null before and after a run, which shows the arrow.
  setLight(light: PlayerWeaponId | null): void {
    if (light === this.light) return
    this.light = light
    this.apply()
  }

  setHeld(held: boolean): void {
    if (held === this.held) return
    this.held = held
    this.apply()
  }

  setEnd(end: boolean): void {
    if (end === this.end) return
    this.end = end
    this.apply()
  }

  setCookie(cookie: boolean): void {
    if (cookie === this.cookie) return
    this.cookie = cookie
    this.apply()
  }

  // The input layer reports whether the pointer was used recently, on a change only.
  setAimActive(active: boolean): void {
    if (active === this.aimActive) return
    this.aimActive = active
    this.apply()
  }

  // A run ends or a new one starts.
  reset(): void {
    this.light = null
    this.held = true
    this.end = false
    this.cookie = false
    this.apply()
  }

  private apply(): void {
    this.controller?.set(cursorFor({ menu: this.held || this.end, cookie: this.cookie, aimActive: this.aimActive, light: this.light }))
  }
}
