import { h } from './dom'

export interface BarItem {
  key: string
  label: string
  count: number
  title?: string
}

// A labelled list of horizontal bars, one per item, scaled to the largest count.
export function barList(title: string, items: BarItem[]): HTMLElement {
  const max = Math.max(1, ...items.map((item) => item.count))
  return h(
    'section',
    { class: 'arcade-bars', 'aria-label': title },
    h('h3', { class: 'arcade-bars-title' }, title),
    h(
      'ul',
      { class: 'arcade-bars-list' },
      ...items.map((item) =>
        h(
          'li',
          { class: 'arcade-bar-row', title: item.title ?? item.label },
          h('span', { class: 'arcade-bar-label' }, item.label),
          h('span', { class: 'arcade-bar-track', 'aria-hidden': 'true' }, h('span', { class: 'arcade-bar-fill', style: `width: ${(item.count / max) * 100}%` })),
          h('span', { class: 'arcade-bar-count' }, String(item.count)),
        ),
      ),
    ),
  )
}
