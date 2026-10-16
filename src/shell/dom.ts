type Child = Node | string | null | undefined | false
type Attributes = Record<string, string | number | boolean | null | undefined | ((event: never) => void)>

function apply(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue
    if (typeof value === 'function') element.addEventListener(name.slice(2), value as EventListener)
    else element.setAttribute(name, value === true ? '' : String(value))
  }
}

function append(element: Element, children: Child[]): void {
  for (const child of children) if (child) element.append(child)
}

// Attributes whose name starts with "on" are event listeners ("onclick"). `true` sets an empty
// attribute, and null, undefined and false leave it out.
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  apply(element, attributes)
  append(element, children)
  return element
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function svg(tag: string, attributes: Attributes = {}, ...children: SVGElement[]): SVGElement {
  const element = document.createElementNS(SVG_NS, tag)
  apply(element, attributes)
  append(element, children)
  return element
}

export function icon(name: string, viewBox: string, ...paths: string[]): SVGElement {
  return svg(
    'svg',
    { class: `arcade-icon arcade-icon-${name}`, viewBox, 'aria-hidden': 'true', focusable: 'false' },
    ...paths.map((d) => svg('path', { d })),
  )
}

// Small inline icons, so the package needs no icon font or library.
export const rocketIcon = () =>
  icon(
    'rocket',
    '0 0 24 24',
    'M12 2c3 2 5 5.5 5 9.5 0 1.6-.3 3-.8 4.2L12 18.5 7.8 15.7C7.3 14.5 7 13.1 7 11.5 7 7.5 9 4 12 2Z',
    'M9.5 17.5 8 21l4-2 4 2-1.5-3.5',
    'M12 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  )

export const alertIcon = () =>
  icon('alert', '0 0 24 24', 'M12 3 22 20H2L12 3Z', 'M12 10v5', 'M12 17.5v.5')

export const fullscreenIcon = () =>
  icon('fullscreen', '0 0 24 24', 'M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5')

export const exitFullscreenIcon = () =>
  icon('exit-fullscreen', '0 0 24 24', 'M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5')

export const gearIcon = () =>
  icon(
    'gear',
    '0 0 24 24',
    'M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  )
