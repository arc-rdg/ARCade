// The start screen puts the mage next to the path when the box is at least this many em wide and
// not taller than wide. The measure is in em so a larger font size keeps the text readable.
const SIDE_BY_SIDE_MIN_EM = 28
// Boxes smaller than this many em in either direction get the compact title card.
const COMPACT_MAX_WIDTH_EM = 22.5
const COMPACT_MAX_HEIGHT_EM = 27
// A short box that is also not very wide cannot hold the wide screen either.
const SHORT_MAX_HEIGHT_EM = 36
const SHORT_MAX_WIDTH_EM = 60
// The banner would be unreadable below this many em, so a tile that small shows the icon.
const BANNER_MIN_WIDTH_EM = 9
const BANNER_MIN_HEIGHT_EM = 5.5

export type Layout = 'wide' | 'stacked' | 'compact'

export interface Box {
  width: number
  height: number
  layout: Layout
  // One factor for the logo, the buttons and the gaps, from what the box can hold.
  scale: number
}

const clamp = (value: number) => Math.max(0.5, Math.min(3, value))

export function boxFor(width: number, height: number, em: number): Box {
  const stacked = width < height || width < SIDE_BY_SIDE_MIN_EM * em
  const compact = width < COMPACT_MAX_WIDTH_EM * em || height < COMPACT_MAX_HEIGHT_EM * em ||
    (height < SHORT_MAX_HEIGHT_EM * em && width < SHORT_MAX_WIDTH_EM * em)
  const layout = compact ? 'compact' : stacked ? 'stacked' : 'wide'
  const scale = compact
    ? Math.min(width / 300, height / 200)
    : stacked
      ? Math.min(width / 420, height / 760)
      : Math.min(width / 900, height / 640)
  return { width, height, layout, scale: clamp(scale) }
}

export function bannerFor(width: number, height: number, em: number) {
  return {
    width,
    height,
    tiny: width < BANNER_MIN_WIDTH_EM * em || height < BANNER_MIN_HEIGHT_EM * em,
    tall: height > width,
    scale: Math.max(0.4, Math.min(3, Math.min(width / 300, height / 200))),
  }
}

// Calls back with the layout size of the element, now and on every resize of it. It is
// offsetWidth/offsetHeight, not getBoundingClientRect: a popup that opens by scaling up from its
// tile is measured at its final size, and a transform never fires the observer. An element
// without layout (zero size, or jsdom) reports nothing.
export function observeSize(element: HTMLElement, onSize: (width: number, height: number, em: number) => void): () => void {
  const measure = () => {
    const width = element.offsetWidth
    const height = element.offsetHeight
    if (width === 0 || height === 0) return
    onSize(width, height, parseFloat(getComputedStyle(element).fontSize) || 16)
  }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  return () => observer.disconnect()
}
