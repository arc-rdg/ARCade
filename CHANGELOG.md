# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Types of changes**

- ✨ `Added` for new features.
- 🔄 `Changed` for changes in existing functionality.
- 🗑️ `Deprecated` for soon-to-be removed features.
- 🔥 `Removed` for now removed features.
- 🐛 `Fixed` for any bug fixes.
- 🔒 `Security` in case of vulnerabilities.

## [Unreleased]

## 0.1.4 - 2026-10-16

### ✨ Added

- SWATE (deprecated) is a new chance encounter in the waystation, a spreadsheet on legs that was recently renamed. Press the interact key near it to refine your augments: swap one stat card, mechanic, ability or legendary augment for another of the same rarity, for twice the FAIR trader's price. You get one swap per boss slain. Weapons and corrupted augments stay out, and every swap shows up in the level history and the run recap.
- A waystation now holds at most one chance encounter, the Datenkrake or SWATE. Each one is less likely to come back after it has appeared once in a run.

### 🐛 Fixed

- Losing a stat card to the Datenkrake or swapping it away at SWATE no longer costs more than the card gave. Before, a card at its stat limit, or one under a corrupted augment that changes the same stat, took too much with it. Losing one of two Rapid Release cards under Shadow IT, for example, now leaves a 3 s dash cooldown instead of 2.5 s.

## 0.1.3 - 2026-10-16

### ✨ Added

- The start screen shows the version in a corner. Click it to read the changelog inside the arcade.
- Small boxes (compact layouts) have a Settings gear next to the fullscreen button, so you can rebind keys there too.
- Settings are also reachable from the pause menu during a run. The game stays paused while you rebind, and Close brings you back to the pause menu.

## 0.1.2 - 2026-10-16

### 🐛 Fixed

- Attacks turn the mage toward the cursor even when another script on the page cancels mouse events, as reported in Firefox. In 0.1.1 the cursor came from Phaser, which skips cancelled events (a mouse gesture add-on cancels them, for example), so the aim stayed at an old spot and the mage swung the way it walked. #1 (by @caroott)
- Right-click no longer opens the browser menu anywhere on the arcade, as reported in Opera. Only the game canvas blocked it before, and on Windows the menu opens where the button is released. Middle clicks are blocked too. (by @caroott)

## 0.1.1 - 2026-10-16

### 🔄 Changed

- Your mage turns to face the mouse when an attack starts, so you can swing one way while running the other. Keyboard-only play works as before. #1 (by @caroott)
- The store shows weapon upgrades the way level-up cards do: an outline, an UPGRADE ribbon and a "Becomes ..." tag. #2 (by @caroott)
- After you beat the unFAIR Trader, you take or leave each card of his loot, so you can keep your weapon. Enter still takes everything. #3 (by @caroott)
- The Accept All Cookies curse is now a cookie banner you click away instead of a stun. It blocks your attacks until you accept it, and it accepts itself after 8 s. #4 (by @caroott)
- Firewall shows a flame aura and a ring out to its 3-tile reach. Its shield lasts 0.9 s instead of 0.4 s, it deals 20 damage instead of 8, and its cooldown drops from 16 s to 14 s. #5 (by @caroott)

### 🐛 Fixed

- The start screen in a narrow, tall box (a phone popup) showed only the mage; now the logo, quest and Start run button stay in view, and short boxes fit without scrolling (by @caroott)

## 0.1.0 - 2026-10-16

### ✨ Added

- The ARCade game, moved here from nfdi4plants/arc-portal-ui with its history (by @caroott)
- A standalone site with an ARC picker and search, a bundled sample ARC, token login, deep links to an ARC, and fullscreen play (by @caroott)
- The embeddable package `@arc-rdg/arcade`, with `mountArcade`, a React adapter (`@arc-rdg/arcade/react`), `readRoCrate` for ARC RO-Crates (`@arc-rdg/arcade/arc`) and the mage image (`@arc-rdg/arcade/mage.png`) (by @caroott)
- GitHub Releases are created from this changelog, with the packed tarball attached (by @caroott)

### 🔒 Security

- The token is sent only as a Bearer token and only to its own hub. Public ARCs are fetched without a token (by @caroott)
