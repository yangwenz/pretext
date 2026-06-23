## Development Setup

Install once:

```sh
bun install
```

### Day-To-Day

- `bun start` — stable local page server at <http://localhost:3000>
- `bun run start:windows` — Windows-friendly fallback without automatic port cleanup
- `bun run check` — typecheck, lint, and dead-code scan (`knip`)
- `bun test` — small durable invariant suite

### Packaging And Release Confidence

- `bun run build:package` — emit `dist/` for the published ESM package
- `bun run package-smoke-test` — pack the tarball and verify temporary JS + TS consumers
- `bun run site:build` — build the static demo site into `site/`
- `bun run generate:bidi-data` — refresh the checked-in simplified Unicode bidi ranges

`prepack` also rebuilds `dist/` through plain `tsc`, so keep runtime `.js` specifiers honest in source imports.

### Browser Accuracy And Benchmarking

- `bun run accuracy-check` — Chrome browser sweep
- `bun run accuracy-check:safari`
- `bun run accuracy-check:firefox`
- `bun run accuracy-snapshot` — refresh `accuracy/chrome.json`
- `bun run accuracy-snapshot:safari`
- `bun run accuracy-snapshot:firefox`
- `bun run benchmark-check` — Chrome benchmark snapshot; default is the median of 3 full page runs, use `--runs=1` for a quick local check
- `bun run benchmark-check:safari`
- `bun run pre-wrap-check` — compact batched browser oracle for `{ whiteSpace: 'pre-wrap' }`
- `bun run keep-all-check` — compact batched browser oracle for `{ wordBreak: 'keep-all' }`, including mixed-script no-space canaries
- `bun run symbol-check` — compact batched Chrome + Safari oracle for no-space symbol runs inside long words
- `bun run letter-spacing-check` — compact batched Chrome + Safari oracle for `{ letterSpacing }`
- `bun run letter-spacing-snapshot` — refresh `accuracy/letter-spacing.json` from the Chrome + Safari compact `{ letterSpacing }` oracle
- `bun run probe-check` — smaller browser probe/diagnostic entrypoint
- `bun run probe-check:safari`

Probe output includes a break trace on first-break mismatches. `sN:gM` is a segment/grapheme position; `[ours]` and `[browser]` mark the competing boundaries. For extractor-sensitive Safari cases, cross-check `--method=span` before changing the engine.

### Corpus Tooling

- `bun run corpus-check` — diagnose one corpus at one or a few widths
- `bun run corpus-check:safari`
- `bun run corpus-sweep` — maintained Chrome `step=10` corpus width sweep
- `bun run corpus-sweep:safari` — maintained Safari `step=10` corpus width sweep
- `bun run corpus-font-matrix` — same corpus under alternate fonts
- `bun run corpus-font-matrix:safari`
- `bun run corpus-taxonomy` — classify a mismatch field into steering buckets
- `bun run corpus-status` — rebuild `corpora/dashboard.json`
- `bun run corpus-status:refresh` — refresh Chrome and Safari `step=10` sweeps, then the corpus dashboard

### Status Dashboards

- `bun run status-dashboard` — rebuild `status/dashboard.json`

## Useful Pages

- `/demos/index` — index of the public demos
- `/accuracy` — browser sweep and per-line diagnostics
- `/benchmark` — performance comparisons
- `/corpus` — long-form corpus diagnostics

## Current Dashboards And Snapshots

Use these for the current checked-in picture:

- [status/dashboard.json](status/dashboard.json) — machine-readable main dashboard
- [accuracy/chrome.json](accuracy/chrome.json), [accuracy/safari.json](accuracy/safari.json), [accuracy/firefox.json](accuracy/firefox.json) — raw browser accuracy rows
- [accuracy/letter-spacing.json](accuracy/letter-spacing.json) — compact Chrome + Safari `{ letterSpacing }` oracle snapshot
- [benchmarks/chrome.json](benchmarks/chrome.json), [benchmarks/safari.json](benchmarks/safari.json) — raw benchmark snapshots
- [corpora/dashboard.json](corpora/dashboard.json) — machine-readable corpus dashboard
- [corpora/chrome-step10.json](corpora/chrome-step10.json), [corpora/safari-step10.json](corpora/safari-step10.json) — checked-in browser `step=10` corpus sweep snapshots

[PLATFORM_BUGS.md](PLATFORM_BUGS.md) is the current browser/OS issue and workaround ledger. [RESEARCH.md](RESEARCH.md) keeps durable findings and rejected approaches; it is not a source for current counts or tracker status.

## Deep Profiling

For one-off performance and memory work, start with `bun start` and an isolated, foreground Chrome using a throwaway profile. Reproduce the issue on [pages/benchmark.ts](pages/benchmark.ts), or on a smaller dedicated page when the benchmark is too broad.

- Use the benchmark for throughput regressions.
- Use a CPU profile or performance trace for hotspots.
- Use heap sampling for allocation churn.
- Diff forced-GC heap snapshots for retained memory.

Bun/Node microbenchmarks are useful for cheap hypotheses, but browser behavior needs browser evidence.
