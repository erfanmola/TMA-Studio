# Protocol tutorial Mini App

Serve this directory over HTTPS and configure its URL as a Telegram Mini App. The page loads Telegram's official Web Apps SDK, signals `ready`, displays theme and viewport state, and lets the user show/hide the MainButton and BackButton or open a host popup.

The launch-data panel reports only whether `initData` is present. It never displays or sends the value. A backend must verify the signed `initData` before trusting identity or authorization fields; this client-only fixture does not perform that verification.

For offline protocol tests, the Playwright fixture intercepts the official SDK URL and serves the pinned, unmodified SDK copy from `tests/fixtures/official-telegram-sdk/`.
