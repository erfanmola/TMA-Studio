# Protocol source drift report

Checked: 2026-09-27T17:28:16.328Z
Pinned source: [Telegram Web Apps SDK](https://telegram.org/js/telegram-web-app.js)
Expected SDK SHA-256: `3549138a7934039fe7dfd1291a4ee739bd2b705a614308053a8b08a87d85c451`  
Observed SDK SHA-256: `3549138a7934039fe7dfd1291a4ee739bd2b705a614308053a8b08a87d85c451`  
Expected SDK event references: 106; observed: 106.

This report checks upstream sources only. It never edits the protocol inventory, generated registry, or platform support claims.

## Findings

- No SDK hash or event-reference drift detected; all inventory documentation URLs responded successfully.

## Inventory documentation sources

| Source | HTTP | Response SHA-256 |
| --- | ---: | --- |
| [https://docs.telegram-mini-apps.com/platform/events](https://docs.telegram-mini-apps.com/platform/events) | 200 | expected 32e71df0ea3116668020372882bced5df7fbc0ddeb12870e34245843b7603d33; observed 32e71df0ea3116668020372882bced5df7fbc0ddeb12870e34245843b7603d33 |
| [https://docs.telegram-mini-apps.com/platform/methods](https://docs.telegram-mini-apps.com/platform/methods) | 200 | expected 9b01fc9fe3c4b8fbc56f6536a63257e7ebc35b1505714be6e6dcd7766d3d431c; observed 9b01fc9fe3c4b8fbc56f6536a63257e7ebc35b1505714be6e6dcd7766d3d431c |

Changed documentation hashes block pull-request review until the baseline is reviewed. Documentation text and SDK events must be updated through explicit source review; this monitor never changes inventory or support claims.
