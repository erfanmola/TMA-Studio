# Bunium native security fixture

This packaged fixture loads a trusted top-level page, a same-origin iframe,
an attacker-origin iframe, a redirect from the allowed origin to an attacker,
and a `bunium://spoof/` URL. It checks that the trusted main frame can use the
bridge, a child frame does not receive it, and forged IPC from the child or
redirected/attacker pages never reaches the host. Package it against the local
Bunium checkout so the native shim and TypeScript bridge match:

```sh
export BUNIUM_REPO=/absolute/path/to/bunium
packaging/mac/package.sh -a tests/native/security/fixture-app \
  -r "$BUNIUM_REPO" -n BuniumSecurityFixture \
  -o /tmp/bunium-security -i com.example.bunium-security --no-dmg
```

Launch `BuniumSecurityFixture.app/Contents/MacOS/BuniumSecurityFixture` from a
terminal. `NATIVE_SECURITY_GATE:PASS` is the fixture's available-platform
result. This fixture must be run on each provisioned OS before claiming the
card's cross-platform exit gate.
