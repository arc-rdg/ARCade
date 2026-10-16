import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { latestRelease } from '../../scripts/release.mjs'

const sample = `# Changelog

## [Unreleased]

### ✨ Added

- Not released yet

## 0.2.0-beta.1 - 2026-11-01

### 🐛 Fixed

- A thing

## 0.1.0 - 2026-10-16

### ✨ Added

- First
`

describe('latestRelease', () => {
  it('skips Unreleased and stops at the next version heading', () => {
    const release = latestRelease(sample)
    expect(release.version).toBe('0.2.0-beta.1')
    expect(release.date).toBe('2026-11-01')
    expect(release.notes).toBe('### 🐛 Fixed\n\n- A thing')
  })

  it('reads the last section to the end of the file and handles CRLF', () => {
    const release = latestRelease('## [Unreleased]\r\n\r\n## 1.2.3 - 2026-01-02\r\n\r\n- Only\r\n')
    expect(release).toEqual({ version: '1.2.3', date: '2026-01-02', notes: '- Only' })
  })

  it('accepts an empty Unreleased section', () => {
    expect(latestRelease('## [Unreleased]\n## 0.1.0 - 2026-10-16\n- x').version).toBe('0.1.0')
  })

  it.each([
    ['no released section', '## [Unreleased]\n\n- x\n'],
    ['missing date', '## [Unreleased]\n\n## 1.0.0\n'],
    ['bracketed version', '## [1.0.0] - 2026-01-01\n'],
    ['bad version', '## 1.0 - 2026-01-01\n'],
    ['bad date', '## 1.0.0 - 01/01/2026\n'],
  ])('rejects %s', (_name, text) => {
    expect(() => latestRelease(text)).toThrow()
  })
})

describe('repository changelog', () => {
  it('has a newest entry that matches package.json', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8')
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const release = latestRelease(changelog)
    expect(release.version).toBe(pkg.version)
    expect(release.notes).not.toBe('')
  })
})
