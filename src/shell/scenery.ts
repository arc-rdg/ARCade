import { svg } from './dom'

// Hand-drawn hills and shelves behind the start screen. Static, so it costs nothing after the first paint.
export function scene(): SVGElement {
  return svg(
    'svg',
    { class: 'arcade-scene', viewBox: '0 0 400 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { class: 'arcade-far', d: 'M0 62 Q30 38 62 52 T118 46 Q150 30 190 50 T262 42 Q310 28 346 48 T400 40 V100 H0Z' }),
    svg('path', { class: 'arcade-shelf', d: 'M20 40 H96 M150 34 H240 M290 38 H378' }),
    svg('path', { class: 'arcade-near', d: 'M0 82 Q44 62 92 76 T180 70 Q240 56 300 74 T400 68 V100 H0Z' }),
  )
}

export function sparkle(): SVGElement {
  return svg(
    'svg',
    { class: 'arcade-sparkle', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8Z' }),
  )
}
