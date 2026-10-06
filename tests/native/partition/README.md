# Bunium partition isolation fixture

Proves isolated persistent CEF request contexts: two partitions on the same
origin keep separate cookies (persistent and session), localStorage,
IndexedDB, Cache Storage and service workers; both persist across a real
process restart; clearing one leaves the other intact; an ephemeral session
is in-memory only; invalid partition keys are rejected; files of cleared or
removed partitions are deleted by the next launch.

The orchestrator (`fixture-app/bunium/main.ts` without `FIXTURE_PHASE`) runs
four phases as separate processes. Pages are served from a fixed loopback
port so every phase uses the same origin.

Unpackaged, against a local Bunium checkout:

```sh
BUNIUM_MODULE="$BUNIUM_REPO/src/index.ts" bun tests/native/partition/fixture-app/bunium/main.ts
```

Packaged (sandboxed, per-app CEF root):

```sh
"$BUNIUM_REPO/packaging/mac/package.sh" -a tests/native/partition/fixture-app \
  -r "$BUNIUM_REPO" -n BuniumPartitionFixture -o /tmp/bunium-partition \
  -i com.example.bunium-partition --no-dmg
/tmp/bunium-partition/BuniumPartitionFixture.app/Contents/MacOS/BuniumPartitionFixture
```

Both print `NATIVE_PARTITION_GATE:PASS`. Run on each provisioned OS (use that
OS's packaging script) before claiming the cross-platform gate.
