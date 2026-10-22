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

## 0.1.6 - 2026-10-22

### ✨ Added

- Training on the start screen is a short practice room for the controls: moving, jumping, dropping through platforms, dashing, dodging, light, heavy and special attacks, combos, cancelling and pausing. Each step shows your own key bindings and ticks off once you have done it, and you can skip any step. One dummy shows your damage and combo, and an angry one winds up and swings so you can practise dashing through it. A "New here?" tag sits on the button until you open it once. At the end you can start a run right away or keep practising.
- SWATE (deprecated) has a sticker that does not hold very well. Give it a few knocks and see what happens.

### 🔄 Changed

- Boss minions are bigger and look dangerous now: spiky red-orange balls with an eye that watches you. They rise up with a ring and a "!" for a moment before they can move or hurt you. Hit them to destroy them. They crack when badly hurt and burst when they die, and the boss info says so too.

### 🐛 Fixed

- Boss danger zones disappear as soon as the danger in that part is over. They shrink behind a charging boss and a travelling shockwave, and fade when a slam, sweep, beam or pillar has finished or the last rain drop has landed. Before, they stayed red until the whole attack ended.

## 0.1.5 - 2026-10-17

### ✨ Added

- Small scribble mouse cursors replace the system one in the game. During play the cursor follows your light weapon: a sword for the staff, scalpel and sequence whip, a star-cross for the wand, pipette pistol, ARCitect and ARC Commander. The cookie banner turns it into a cookie. Buttons and cards get a glove, a card you cannot buy gets a crossed circle, the level history and run recap lists get an open hand and a closed one while you drag, and monsters get a magnifier while the game is paused. The start screen, settings and changelog get the arrow and the glove too.
- Attacks follow the cursor for 10 s after you last move or click the mouse (it was 3 s), and the gameplay cursor hides when the mouse rests for as long. Menus, pauses and overlays never hide it, and touch screens get no custom cursors.

### 🔄 Changed

- Jumps, dashes and attacks pressed in the last 120 ms of a flinch or stun now go through instead of getting lost.
- Light attacks pull the weapon back before they swing. On the ground you run at half speed while attacking and at full speed once the attack can be cancelled, and an attack aimed with the mouse keeps the mage facing that way until it ends. Lunges now push you forward while you hold a direction. Dash attacks keep 60 % of the dash speed instead of all of it, so they slide much less far, and a dash or jump ends the hit pause right away.
- Melee mobs wind up longer before they attack (320 to 380 ms, golems 50 ms more) with a visible lean, crouch or raised weapon, and a single orange flash replaces the strobe. Bats wind up before a dive and never dive from close range, and beetles crouch before they charge.
- Bow and wand mobs back away when you get close, and their point-blank shots come later. Touching a mob no longer hurts more than its weapon, and a mob attacks at most once every 0.8 s.
- Boss light attacks show a wind-up pose that lasts 270 ms after a step without annotations and up to 450 ms after a fully annotated one. It was 250 ms for every boss.
- Bosses rest less between attacks, and the worse the annotation, the more they attack: about twice as often after a step without annotations, about 12 % more after a fully annotated one. The opening after a heavy attack is shorter, 0.4 to 0.7 s instead of 0.6 to 1.5 s.
- Boss tell text shows up 300 ms before a heavy attack's danger zone. Floor rain also marks the platform tops, and its drops fall behind the platforms.
- The camera follows at the same speed at 30, 60 and 120 fps and turns its look-ahead around faster.

### 🐛 Fixed

- The aimed boss beam hits exactly where it is drawn.
- During a heavy boss rain the stagger bar stays locked until the last drop has landed. It used to unlock while drops were still falling, so hits filled it, and a stagger there left the drops falling and the boss did not look staggered.
- A boss that changes phase in the middle of an attack no longer follows up with a heavy attack right away.
- Standing on a platform during a quake or flood no longer counts towards the boss's camping rule.

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
