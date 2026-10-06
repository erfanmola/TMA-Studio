# Bunium guest-view fixture

Proves the untrusted guest contract: a Telegram-style transport
(`TelegramWebviewProxy.postEvent` / receiver) exists before the first inline
page script; the guest never receives `__bunium`, the native `post` function
or a transport in subframes; messages route to the guest handle that created
the view; navigation, cross-origin redirect, reload and renderer crash each
rotate the document generation; replies to an old generation are refused and
never delivered; one guest crashing leaves another working and a crashed
guest recovers; twenty create/dispose cycles (including disposal before CEF
finished creating the browser) return native view/client counts to baseline.

Unpackaged, against a local Bunium checkout:

```sh
BUNIUM_MODULE="$BUNIUM_REPO/src/index.ts" bun tests/native/guest/fixture-app/bunium/main.ts
```

Packaged (sandboxed):

```sh
"$BUNIUM_REPO/packaging/mac/package.sh" -a tests/native/guest/fixture-app \
  -r "$BUNIUM_REPO" -n BuniumGuestFixture -o /tmp/bunium-guest \
  -i com.example.bunium-guest --no-dmg
/tmp/bunium-guest/BuniumGuestFixture.app/Contents/MacOS/BuniumGuestFixture
```

Both print `NATIVE_GUEST_GATE:PASS` plus a `GUEST_EVIDENCE` JSON line. Run on
each provisioned OS before claiming the cross-platform gate.
