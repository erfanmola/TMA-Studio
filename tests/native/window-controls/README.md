# Native window-controls fixture

Proves idempotent native window management on a real OS window: two windows
(main 480x360 + owned non-resizable dialog 360x240), capability reporting,
show/minimize/restore/hide/focus, `showMessageBox`, `onClose` ordering, and
that controls on a closed window report a closed-window error.

Unpackaged, against a local Bunium checkout:

```sh
BUNIUM_REPO=/path/to/bunium bun test tests/native/window-controls/qualification.test.ts
```

The fixture resolves its runtime through `BUNIUM_MODULE` (falling back to the
installed `bunium` package for packaged launches), like the guest/partition
fixtures. Both print `NATIVE_WINDOW_CONTROLS_GATE:PASS` plus a
`WINDOW_CONTROL_EVIDENCE` JSON line. Run on each provisioned OS with that OS's
packaging script before claiming the cross-platform gate.

## Capture helpers (not gates)

- `BUNIUM_WINDOW_CONTROLS_HOLD=1` pauses ~5s at each stage
  (`WINDOW_CONTROL_STAGE:<name>`) so a native capture can be taken.
- `BUNIUM_WINDOW_CONTROLS_MODAL=1` shows a real native message box mid-run
  (`WINDOW_CONTROL_MODAL_RESULT:<response>`); dismiss it to continue.

## Known issue (Windows)

A HOLD run that leaves a window minimized for seconds and then restores it
crashes the browser process (`0x80000003`) instead of completing. Fast
minimize/restore sequences (the gate itself), hide/show round-trips of any
duration, and OS-driven taskbar minimize/restore are unaffected. Repro:
`BUNIUM_WINDOW_CONTROLS_HOLD=1` unpackaged run dies after the `minimized`
stage. Needs a native debugger (cdb/WinDbg) to root-cause; see the Windows
qualification evidence for the full bisection trail.
