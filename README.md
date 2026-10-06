# TMA Studio

A focused desktop workspace for building and testing Telegram Mini Apps. Version 2 is in development and has not been released; there are no installers to download.

Independent open-source software. Not affiliated with or endorsed by Telegram. A simulator does not replace final testing in real Telegram clients.

## Status

- Version 2 — unreleased. Release notes will be published with the first qualified release.
- Desktop runtime is currently qualified on macOS on Apple silicon; Windows and Linux verification is still in progress.
- All six client profiles (Android, iOS, Telegram Desktop, macOS, Web A, Web K) are in development and not yet verified. Capability claims are published per profile only after proof; until then every profile reads “in development”.

## Repository layout

- `apps/studio` — desktop app (renderer + Bunium host services).
- `apps/site` — static prerendered website (Home, Download, Getting started, Compatibility, Changelog, Privacy, Support) in five locales.
- `packages/ui` — shared interface primitives and bundled fonts.
- `tests/unit` — unit suites run by `bun test`.
- `tests/visual/browser` — deterministic Chromium scene suite with reviewed baselines.
- `tests/native` — platform fixtures requiring real desktop sessions.
- `scripts` — check, harness and packaging helpers.
- `docs` — compatibility, privacy, support and third-party notices.

## Prerequisites

- Bun 1.4.0.
- A macOS, Windows or Linux desktop.

## Commands

All commands run from the repository root.

```sh
bun install --frozen-lockfile
bun run check
bun run build:studio
bun run dev
```

Focused suites:

```sh
bun run test:unit
bun run typecheck:visual
bun run check:site
bun run build:site
```

`bun run check` runs typecheck, Biome, style, token, locale-parity, protocol-registry and protocol-conformance checks, then the full unit suite. It must pass before any visual or native run is treated as evidence.

## Compatibility

Every profile renders Mini Apps with Chromium through CEF. Studio does not run Android, iOS or their native browser engines; confirm engine-specific behavior on real devices. Studio’s own interface uses Inter for Latin/Cyrillic and Vazirmatn for Arabic/Persian in every profile; your Mini App’s typography is never changed. Details live in `docs/COMPATIBILITY.md` and on the website’s Compatibility page.

## Privacy

The website is static: no third-party scripts, fonts, analytics, trackers or cookies. The app is designed to keep account sessions and bot tokens in the host process and protected system credential storage, separate from Mini App browser data. Never include bot tokens, Telegram sessions or unredacted launch data in issue reports. Full notes are in `docs/PRIVACY.md`.

## Support and security

- Questions and bugs: open an issue in the GitHub repository with your platform, app version, steps to reproduce and what you expected.
- Security problems: report them privately through the maintainer contact listed on the GitHub repository, never in a public issue.
- Sponsorship would fund cross-platform testing, protocol maintenance, accessible interfaces and reliable releases. Options will be listed when available.

## License and notices

The version 2 license will be announced with the first qualified release. Third-party notices for the bundled variable fonts are in `docs/NOTICES.md` and beside the font files.
