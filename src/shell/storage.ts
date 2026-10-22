// A yes-or-no note that outlives the page. A browser that refuses storage (a private window, a
// blocked site) reads as "not set" and silently forgets the write.
export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Nothing to do: the flag only hides a hint.
  }
}
