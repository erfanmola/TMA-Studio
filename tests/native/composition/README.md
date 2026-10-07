# Native guest composition fixture

Exercises one transparent host window with two overlapping CEF guests and a
trusted transparent `BuniumOverlay`. The fixture checks overlay origin-bound
trust and IPC, overlay z-order after guest clipping, guest-local click
coordinates, guest resize, rounded clipping, and input fall-through at a
clipped guest corner. The retained macOS desktop capture proves the overlay
paint is above Guest A while Guest B remains visible outside it. Windows and
Linux native alpha composition remain unqualified.

Run unpackaged against a local Bunium checkout from the Studio workspace:

```sh
BUNIUM_REPO=/path/to/bunium bun test tests/native/composition/qualification.test.ts
```

The app itself prints a `COMPOSITION_EVIDENCE` JSON line before
`NATIVE_COMPOSITION_GATE:PASS` for the trusted host overlay, guest stacking,
clipping, and input. It does not certify other OS backends.

## Capture helpers (not gates)

`HOLD_OPEN=1` (with optional `HOLD_OPEN_MS`, default 30000) keeps windows
open for actual-window capture: after a PASS it holds a decoy composition
(`COMPOSITION_DECOY_READY`); on failure it holds whatever composed so far
(`COMPOSITION_HOLD_ON_FAILURE`) before tearing down. On Windows the overlay
API is macOS-only, so a held run captures the transparent host window
without guests/overlays and still exits `NATIVE_COMPOSITION_GATE:FAIL`.
