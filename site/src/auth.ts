import type { Hub } from './hubs'

/** A token is always paired with the hub it was entered for. */
export interface Session {
  hub: Hub
  token: string | null
}

const PREFIX = 'arcade.token.'

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key) } catch { return null }
}

/** Returns the stored token for exactly this hub (session storage wins over remembered). */
export function loadToken(hub: Hub): string | null {
  return read(() => sessionStorage, PREFIX + hub.id) ?? read(() => localStorage, PREFIX + hub.id)
}

export function saveToken(hub: Hub, token: string, remember: boolean): void {
  clearToken(hub)
  try { (remember ? localStorage : sessionStorage).setItem(PREFIX + hub.id, token) } catch { /* storage blocked */ }
}

export function clearToken(hub: Hub): void {
  try { sessionStorage.removeItem(PREFIX + hub.id) } catch { /* storage blocked */ }
  try { localStorage.removeItem(PREFIX + hub.id) } catch { /* storage blocked */ }
}
