# Compatibility

TMA Studio targets six Telegram client profiles: Android, iOS, Telegram Desktop, macOS, Web A and Web K. Each profile reports verified, simulated and unsupported capabilities separately. Until a profile completes its proof, its status is “in development — not yet verified”.

## What the simulator is

- One stable guest surface per session with a floating toolbar (Top default; Bottom, Left and Right supported).
- Mock and authentic launch modes are separate. Mock outcomes never claim Telegram authenticity.
- A simulator does not replace final testing in real Telegram clients.

## Rendering engine

Every profile renders Mini Apps with Chromium through CEF. Studio does not run Android, iOS or their native browser engines. Confirm engine-specific behavior (keyboard, media, payments, sharing, fullscreen) on real devices.

## Typography

Studio’s own interface uses Inter (Latin/Cyrillic) and Vazirmatn (Arabic/Persian) in every profile. This differs from some Telegram clients by design and never changes your Mini App’s fonts.

## Current evidence

- Protocol coverage is executable per family with pinned fixtures; profile support stays unverified until native and reference proof land.
- Desktop runtime qualification is currently macOS on Apple silicon. Windows and Linux runs are recorded separately before any release claim.
