import css from './arcade.css?inline'
import cursors from './cursors.css?inline'

// One <style data-arcade> per document, shared by every mounted arcade and removed with the last.
const users = new WeakMap<Document, { count: number; style: HTMLStyleElement }>()

export function acquireStyles(doc: Document): () => void {
  let entry = users.get(doc)
  if (!entry) {
    const style = doc.createElement('style')
    style.setAttribute('data-arcade', '')
    // The cursors come last, so they win over a rule of the same weight above.
    style.textContent = css + cursors
    doc.head.append(style)
    entry = { count: 0, style }
    users.set(doc, entry)
  }
  entry.count++
  let released = false
  return () => {
    if (released) return
    released = true
    const current = users.get(doc)
    if (!current || --current.count > 0) return
    current.style.remove()
    users.delete(doc)
  }
}
