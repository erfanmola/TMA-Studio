# Native account IPC fixture

Runs the account RPC contract over Bunium's real trusted-origin CEF channel.
The renderer sends synthetic phone, code, and 2FA commands; the host uses a
network-free account service and the production `handleAccountRequest`
dispatcher. It verifies status, profile listing, reauthorization, and that raw
phone/code/password material does not appear in replies.

Run from `tma-studio` with the checked-out Bunium source linked as the
`bunium` dependency (the npm `0.0.6` package predates trusted-origin API v1):

```sh
rtk bunx tsc --build tests/native/account/tsconfig.json
rtk bun tests/native/account/account-ipc.smoke.ts
rtk bun tests/native/account/users-screen.smoke.ts
```

The fixture exits with `NATIVE_ACCOUNT_IPC_GATE:PASS` on success. It performs no
Telegram network requests and closes its window and local HTTP server itself.
The Users scene smoke opens the production route through CEF, serves one
synthetic identity from an in-memory SQLite store over the production Users
RPC handler, and captures a native frame at `/tmp/06a-users-cef.png` for visual
review. It makes no Telegram network requests.
