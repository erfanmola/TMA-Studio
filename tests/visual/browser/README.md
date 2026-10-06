# Browser visual harness

This Playwright suite captures the shared UI review scenes in `scenes.ts` and
checks keyboard, form, dialog, storage, toast, and layout behavior in
`interactions.pw.ts`. It runs a local Studio Vite server, blocks requests to
non-local origins, fixes the clock and random seed, waits for the bundled local
fonts, and records browser, OS, DPR, viewport, locale, time, and source fixture
revision with each result. Screenshot animation and caret are disabled.

## Run

From the repository root:

```sh
bun run typecheck:visual
bun run test:visual:browser
bun run test:visual:selftest
```

The browser suite requires the Playwright Chromium browser installed for the
locked Playwright version. It runs against DPR 1 and, for scenes tagged
`@dpr2`, DPR 2. HTML report, JSON results, traces, and expected/actual/diff
images are written under `.cache/visual/` (ignored by Git). Failed test traces
are retained for diagnosis.

## Review and accept baselines

Baselines are platform-specific because font rasterization differs by OS.
Missing or changed snapshots fail; ordinary runs never update them. Review the
actual images first, then accept a deliberately scoped set:

```sh
bun run test:visual:accept -- --grep 'primitives scale 100%'
```

The broad `--all --reviewed` form is available only after every resulting
image has been reviewed. Inspect changed PNGs with `git status`/`git diff` and
review them before retaining the baseline update. Do not accept changes solely
to make a run green.

To verify that the failure path produces useful evidence, the self-test injects
a conspicuous defect into the primitives scene. It expects a non-zero
Playwright result and expected plus diff images; its temporary output is
removed unless `--keep` is passed.

## Scope and limits

The current catalog covers primitive, control, catalog, and loading browser
scenes, light/dark, English/Persian where those panels exist, 100%/200% scale,
and DPR 1/2 where configured. Interaction checks cover selected keyboard and
ARIA contracts, IME composition through Chromium CDP, dialogs, storage states,
toasts, and drag-region structure. `scenes.ts` is the source of truth for
capture coverage.

These are local Chromium browser results. They do not prove native CEF
composition, operating-system input methods/accessibility, six Telegram client
profiles, all product windows/locales, packaged behavior, performance budgets,
or Windows/Linux rendering. W11's full matrix and native captures remain
future work; screenshots and timing from this harness must not be presented as
that evidence.
