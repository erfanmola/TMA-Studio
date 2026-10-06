# Studio simulator native guest fixture

This fixture runs the actual `HostSimulatorService`, `SimulatorController`,
trusted session adapter, and document-start bridge against a native Bunium
Guest/Session v1 checkout. It verifies one native guest survives theme, mode,
and toolbar-side changes, while native mouse input reaches the guest at the
expected local coordinates for Top and Left placements.

Run on macOS with:

```sh
BUNIUM_REPO=/path/to/bunium bun test tests/native/simulator/qualification.test.ts
```

The test source loads `src/index.ts` and `src/native.ts` from `BUNIUM_REPO`.
This fixture does not qualify a separately installed or published package.
