import { expect, it } from 'vitest'
import { inline, isWebUrl, renderChangelog } from '../../src/shell/markdown'

const html = (nodes: Node[]) => {
  const box = document.createElement('div')
  box.append(...nodes)
  return box
}

it('builds text, code, bold and web links from inline Markdown', () => {
  const box = html(inline('A `b` **c** [d](https://example.com/x?y=(1)) [e](ftp://host) [f](javascript:alert(1))'))

  expect(box.querySelector('code')?.textContent).toBe('b')
  expect(box.querySelector('strong')?.textContent).toBe('c')
  expect(box.querySelectorAll('a')).toHaveLength(1)
  expect(box.querySelector('a')?.getAttribute('href')).toBe('https://example.com/x?y=(1)')
  expect(box.textContent).toBe('A b c d e f')
})

it('accepts only http and https as link targets', () => {
  expect(isWebUrl('https://a.b')).toBe(true)
  expect(isWebUrl('http://a.b')).toBe(true)
  expect(isWebUrl('javascript:alert(1)')).toBe(false)
  expect(isWebUrl('data:text/html,x')).toBe(false)
  expect(isWebUrl('/relative')).toBe(false)
})

it('never makes elements from raw HTML in the text', () => {
  const box = html(renderChangelog('## 1.0.0 - 2026-01-01\n\n### Added\n\n- <img src=x onerror=alert(1)> and <script>x</script>\n'))

  expect(box.querySelector('img, script')).toBeNull()
  expect(box.querySelector('li')?.textContent).toBe('<img src=x onerror=alert(1)> and <script>x</script>')
})

it('skips the header, the legend and empty sections, and joins wrapped bullets', () => {
  const box = html(
    renderChangelog('# Changelog\n\nintro\n\n**Types of changes**\n\n- legend\n\n## [Unreleased]\n\n## 1.0.0 - 2026-01-01\n\n### Fixed\n\n- one\n  wrapped\n- two\n'),
  )

  expect(box.querySelectorAll('h3')).toHaveLength(1)
  expect(box.querySelector('h3')?.textContent).toBe('1.0.0 - 2026-01-01')
  expect([...box.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['one wrapped', 'two'])
})
