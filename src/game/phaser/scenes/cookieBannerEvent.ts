// The loadout emits this on the game's event emitter when the cookie banner of Accept All Cookies
// opens (with a handle) or closes (with null). The HUD shows the banner and calls `accept` when the
// player clicks it away. Nobody listens in the sandboxes without a HUD, so the loadout skips the
// banner there.
export const COOKIE_BANNER_EVENT = 'cookie-banner'
// The gameplay scene emits this with true while the world is held (pause, level-up, store, intros)
// and with false when play goes on. The HUD hides the banner meanwhile.
export const COOKIE_SUSPEND_EVENT = 'cookie-suspend'

// Where the mage is on screen, as fractions of the view height.
export interface MageBand {
  top: number
  bottom: number
}

export interface CookieBannerHandle {
  accept(): void
  // Fills `out` with where the mage stands on screen, so the HUD keeps the banner off it.
  mageBand(out: MageBand): void
}
