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

## 0.1.0 - 2026-10-16

### ✨ Added

- The ARCade game, moved here from nfdi4plants/arc-portal-ui with its history (by @caroott)
- A standalone site with an ARC picker and search, a bundled sample ARC, token login, deep links to an ARC, and fullscreen play (by @caroott)
- The embeddable package `@arc-rdg/arcade`, with `mountArcade`, a React adapter (`@arc-rdg/arcade/react`), `readRoCrate` for ARC RO-Crates (`@arc-rdg/arcade/arc`) and the mage image (`@arc-rdg/arcade/mage.png`) (by @caroott)
- GitHub Releases are created from this changelog, with the packed tarball attached (by @caroott)

### 🔒 Security

- The token is sent only as a Bearer token and only to its own hub. Public ARCs are fetched without a token (by @caroott)
