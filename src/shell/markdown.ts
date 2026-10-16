import { h } from './dom'

// Renders the part of Markdown that CHANGELOG.md uses: "## " version headings, "### " type headings,
// "- " bullets, `code`, **bold** and [links](url). Every piece becomes a DOM node or text, never HTML.

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g

export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function inline(text: string): Node[] {
  const nodes: Node[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)))
    const [, code, bold, label, url] = match
    if (code !== undefined) nodes.push(h('code', {}, code))
    else if (bold !== undefined) nodes.push(h('strong', {}, ...inline(bold)))
    else if (isWebUrl(url)) nodes.push(h('a', { href: url, rel: 'noopener noreferrer', target: '_blank' }, label))
    else nodes.push(document.createTextNode(label))
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)))
  return nodes
}

interface Section {
  title: string
  groups: { title: string; items: string[] }[]
}

// Splits the file into versions, each with its type groups. The header, the "Types of changes"
// legend and sections without a bullet (an empty [Unreleased]) are dropped.
function sections(source: string): Section[] {
  const result: Section[] = []
  let section: Section | null = null
  let group: Section['groups'][number] | null = null
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) {
      section = { title: line.slice(3).trim(), groups: [] }
      group = null
      result.push(section)
    } else if (!section) {
      continue
    } else if (line.startsWith('### ')) {
      group = { title: line.slice(4).trim(), items: [] }
      section.groups.push(group)
    } else if (line.startsWith('- ')) {
      group ??= { title: '', items: [] }
      if (!section.groups.includes(group)) section.groups.push(group)
      group.items.push(line.slice(2).trim())
    } else if (/^\s+\S/.test(line) && group && group.items.length > 0) {
      group.items[group.items.length - 1] += ` ${line.trim()}`
    }
  }
  return result.filter((entry) => entry.groups.some((entry) => entry.items.length > 0))
}

export function renderChangelog(source: string): HTMLElement[] {
  return sections(source).map((section) =>
    h(
      'section',
      { class: 'arcade-log-version' },
      h('h3', { class: 'arcade-log-heading' }, section.title),
      ...section.groups.map((group) =>
        h(
          'div',
          { class: 'arcade-log-group' },
          group.title && h('h4', { class: 'arcade-log-type' }, group.title),
          h('ul', { class: 'arcade-log-list' }, ...group.items.map((item) => h('li', {}, ...inline(item)))),
        ),
      ),
    ),
  )
}
