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
