import { CORRUPTION } from './corrupted'

// The cookie banner of Accept All Cookies. Every `everyMs` it opens and blocks the mage's attacks
// until it is accepted, or until `autoAcceptMs` run out. Only the timers live here. The
// scene shows the banner and passes the clicks on.

export const COOKIE_TEXT = {
  title: 'We value your privacy',
  body: 'We and our 1,412 partners use cookies to store and access your metadata.',
  accept: 'Accept all',
  manage: 'Manage preferences',
  save: 'Save preferences',
  prefsTitle: 'Your preferences',
  hint: 'Enter: Accept all',
  prefs: ['Strictly necessary metadata', 'Ontology tracking', 'Personalised peer review', 'Legitimate interest in your DOI'],
} as const

export interface CookieBannerTimes {
  everyMs: number
  autoAcceptMs: number
}

export type CookieBannerEvent = 'opened' | 'autoAccepted'

export interface CookieBanner {
  // One fixed step of play. `canOpen` false (an overlay is up) keeps a due banner waiting.
  step(dtMs: number, canOpen?: boolean): CookieBannerEvent | null
  // True when the banner was open and is closed now.
  accept(): boolean
  isOpen(): boolean
  // Closes the banner and starts the wait over.
  reset(): void
}

export function createCookieBanner(times: CookieBannerTimes = CORRUPTION.acceptAllCookies): CookieBanner {
  let waitMs = 0
  let openMs = 0
  let open = false
  return {
    step(dtMs, canOpen = true) {
      if (open) {
        openMs += dtMs
        if (openMs < times.autoAcceptMs) return null
        open = false
        waitMs = 0
        return 'autoAccepted'
      }
      waitMs += dtMs
      if (waitMs < times.everyMs || !canOpen) return null
      open = true
      openMs = 0
      return 'opened'
    },
    accept() {
      if (!open) return false
      open = false
      waitMs = 0
      return true
    },
    isOpen: () => open,
    reset() {
      open = false
      waitMs = 0
      openMs = 0
    },
  }
}
