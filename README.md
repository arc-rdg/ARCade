# ARCade

ARCade turns the provenance of an ARC (Annotated Research Context) into a small platformer. The path
through the game follows the ARC's processes, the monsters are its samples and data files. It is a
Phaser game wrapped in a framework-free widget, `@arc-rdg/arcade`, that any page can embed.

Site: https://arc-rdg.github.io/ARCade/

Deep links:

- `?project=<id>` opens a project on git.nfdi4plants.org
- `?hub=plantmicrobe&project=<id>` opens a project on gitlab.plantmicrobe.de
- `?sample=talinum` opens the bundled Talinum sample
- `&seed=<text>` fixes the path

Private ARCs need a personal access token, entered on the site (kept in sessionStorage unless
"remember" is ticked).

## Browsers

ARCade runs in current Chrome, Edge, Firefox, Safari and Opera and needs a keyboard and a mouse.
Right-click (heavy attack) never opens the page menu inside the arcade. Mouse gestures in Opera, and
gesture add-ons in other browsers, belong to the browser, and a page cannot turn them off. If a
right-button drag starts a gesture, turn gestures off in the browser or rebind heavy to a key in
Settings. On a Windows touchpad, clicks made while a key is held are dropped; binding the attacks to
keys avoids that.

## Embedding

The package has three entry points. Phaser is loaded only when a run starts.

### Vanilla

```ts
import { mountArcade } from '@arc-rdg/arcade'

const handle = mountArcade(document.getElementById('game')!, {
  title: 'My ARC',
  provenance, // ArcadeProvenance, see below
  onEvent: (event) => console.log(event.type),
})
handle.update({ title: 'Other ARC', provenance: other }) // back to the start screen
handle.destroy()
```

The game fills its host element, so the host needs a definite size (for example a fixed height or `flex: 1`). The arcade root is a size container (`container-type: size`), so a host with `height: auto` collapses to nothing. Options: `seed`, `autoStart`,
`bindingsStorageKey` (default `arc-mage.bindings.v1`, `null` keeps bindings for the session),
`fullscreen` (default true), `onEvent`. `mountArcadeBanner(el)` mounts the compact tile banner.

### React

React 18 or newer is an optional peer.

```tsx
import { Arcade, ArcadeBanner } from '@arc-rdg/arcade/react'

<div style={{ height: 600 }}>
  <Arcade title={title} provenance={provenance} onEvent={onEvent} />
</div>
```

`<Arcade>` takes the same options plus `className` and `style`, and fills its parent. A new
`title`, `provenance` or `seed` updates the running widget; the other options are read once at
mount. `<ArcadeBanner>` is the tile banner.

### Reading an ARC

`@arc-rdg/arcade/arc` builds the provenance from an RO-Crate and needs the optional peer
`@nfdi4plants/arctrl` (^3). TypeScript consumers need `allowImportingTsExtensions: true` and
`skipLibCheck: true`, because arctrl's typings require them.

```ts
import { readRoCrate, provenanceFromArc } from '@arc-rdg/arcade/arc'

const { title, provenance } = readRoCrate(await (await fetch('ro-crate-metadata.json')).text())
// or, with an ARC object you already have: provenanceFromArc(arc)
```

`@arc-rdg/arcade/mage.png` is the mage image.

### ArcadeProvenance

Plain JSON (no Maps), so it can be built by the host or posted across frames. Extra fields are
allowed.

```ts
interface ArcadeProvenance {
  datasets: { id: string; kind: DatasetKind }[]
  processes: { key: string; name: string; signatures: { rowIds: string[]; annotations: Annotation[] }[] }[]
  rows: { id: string; processKey: string; datasetId: string; inputs: string[]; outputs: string[] }[]
  nodes: { id: string; kind: IoKind; annotations: Annotation[] }[]
}
```

The exact types are in `src/arc/provenance/`.

## Install from a GitHub Release

Until the package is on npm, install a release tarball (pin the version):

```
npm i https://github.com/arc-rdg/ARCade/releases/download/v0.1.0/arc-rdg-arcade-0.1.0.tgz
```

It is the tarball `npm pack` produces, the same one npm would serve. React and
`@nfdi4plants/arctrl` are optional peers, as described under Embedding.

## Development

```
npm ci
npm run dev           # the site (Vite)
npm run storybook
npm test              # vitest
npm run typecheck     # tsc -b
npm run lint          # oxlint
npm run build         # the library into dist/ (ES modules + bundled .d.ts)
npm run pack:check    # npm pack, publint, @arethetypeswrong/cli (esm-only)
npm run build:site    # the Pages site into dist-site/
```

Layout: `src/game` (the Phaser game, see `src/game/README.md` for its documentation), `src/shell`
(the vanilla widget), `src/react`, `src/arc` (provenance input and builders), `site` (the Pages
app), `tests`.

## Publishing

The package is not published yet and is marked `"private": true` so it cannot be published by accident.
To publish: create the `@arc-rdg` organisation on npm, remove `"private": true` from
`package.json`, run `npm run build && npm run pack:check`, then `npm publish --access public`.

### Releasing

Releases are driven by `CHANGELOG.md`. To release, add a `## <version> - <YYYY-MM-DD>` section
below `## [Unreleased]` (same format as the existing entries) and set the same `version` in
`package.json`; CI fails if the two disagree. Merge or push to `main`. After CI has passed, the
Release workflow checks whether the tag `v<version>` exists; if not, it builds and packs the package,
creates the tag and publishes a GitHub Release with that changelog section as notes and the tarball
attached. Versions with a `-` (for example `0.2.0-beta.1`) are marked as pre-releases.

### CI

The CI workflow (tsc, oxlint, vitest, build, pack:check, build:site) runs on every push and pull
request to `main`. The Pages site is deployed only after CI has passed on a push to `main`.
