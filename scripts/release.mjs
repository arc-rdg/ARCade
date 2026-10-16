// Changelog-driven release helper (plain Node, no dependencies).
//   node scripts/release.mjs check            changelog and package.json agree
//   node scripts/release.mjs notes <outfile>  write the newest section as release notes
//   node scripts/release.mjs version          print the newest changelog version
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`
const HEADING = new RegExp(String.raw`^## (${SEMVER}) - (\d{4}-\d{2}-\d{2})\s*$`)

/** Parse the newest released section (the first `## x.y.z - date` after [Unreleased]). */
export function latestRelease(changelogText) {
  const lines = changelogText.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^## /.test(l) && !/^## \[Unreleased\]\s*$/i.test(l))
  if (start === -1) throw new Error('CHANGELOG.md has no released version section.')
  const match = HEADING.exec(lines[start])
  if (!match) {
    throw new Error(
      `Malformed changelog heading "${lines[start]}"; expected "## <version> - <YYYY-MM-DD>".`,
    )
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (end === -1) end = lines.length
  const notes = lines.slice(start + 1, end).join('\n').trim()
  return { version: match[1], date: match[2], notes }
}

function main(argv) {
  const [command, outfile] = argv
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  const release = latestRelease(changelog)
  if (command === 'version') {
    console.log(release.version)
  } else if (command === 'notes' && outfile) {
    writeFileSync(outfile, `${release.notes}\n`)
  } else if (command === 'check') {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    if (pkg.version !== release.version) {
      throw new Error(
        `package.json version ${pkg.version} does not match the newest CHANGELOG.md version ${release.version}. Bump both together.`,
      )
    }
    if (!release.notes) throw new Error(`CHANGELOG.md section ${release.version} is empty.`)
    console.log(`OK: ${release.version} (${release.date})`)
  } else {
    throw new Error('Usage: release.mjs check | version | notes <outfile>')
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
}
