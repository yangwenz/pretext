# Research Log

Durable findings and rejected approaches from building this library.

For the current browser-accuracy / benchmark snapshot, see `status/dashboard.json`.
For the current corpus / sweep snapshot, see `corpora/dashboard.json`.
For the shared mismatch vocabulary, see `corpora/TAXONOMY.md`.
For current browser and OS bug reports, related tracker issues, and compatibility behavior, see `PLATFORM_BUGS.md`.

## The problem: DOM measurement interleaving

When UI components independently measure text heights with DOM reads like `getBoundingClientRect()`, each read can force synchronous layout. If those reads interleave with writes, the browser can end up relaying out the whole document repeatedly.

The goal here was always the same:
- do the expensive text work once in `prepare()`
- keep `layout()` arithmetic-only
- make resize-driven relayout cheap and coordination-free

## Architecture: Canvas measureText + word-width caching

Canvas `measureText()` avoids DOM layout. It goes straight to the browser's font engine.

That led to the basic two-phase model:
- `prepare(text, font)` — segment text, measure segments, cache widths
- `layout(prepared, maxWidth, lineHeight)` — walk cached widths with pure arithmetic

That architecture held up across the broad browser sweeps, while the hot `layout()` path remained the core product win.

## Rejected: DOM-based or string-reconstruction measurement in the hot path

Several alternatives were tried and rejected:

- measuring full candidate lines as strings during `layout()`
- moving measurement into hidden DOM elements during `prepare()`
- using SVG `getComputedTextLength()`

The pattern was consistent:
- they either reintroduced DOM reads
- or they were slower than the current two-phase model
- or they looked cleaner locally but regressed the actual benchmark path

The important keep was architectural, not algorithmic:
- `layout()` stayed arithmetic-only on cached widths

## Discovery: system-ui font resolution mismatch

Canvas and DOM resolved `system-ui` to different font variants on macOS at certain sizes in the [recorded scan](research-data/system-ui-size-scan.json). Mismatches clustered at `10-12px`, `14px`, and `26px`; `13px`, `15-25px`, and `27-28px` were exact.

Lookup tables, naive scaling, and guessed resolved-font substitution were not trustworthy. A narrow prepare-time DOM fallback for detected bad tuples is the only believable future path; current browser findings and workarounds live in [PLATFORM_BUGS.md](PLATFORM_BUGS.md).

## Discovery: word-by-word sum accuracy

Canvas is internally consistent enough that summing measured segments works very well, but not perfectly. Over a full paragraph, tiny adjacency differences can accumulate into a line-edge error.

The keeps were small and semantic:
- merge punctuation into the preceding word before measuring
- let trailing collapsible spaces hang instead of forcing a break

What did **not** survive:
- full-string verification in `layout()`
- uniform rescaling
- generic pair-level correction models

The broad lesson was that local semantic preprocessing paid off more than clever runtime correction.

## Discovery: text-shaper is a useful reference, not a runtime replacement

`text-shaper` was useful reference material, especially for Unicode coverage and bidi ideas, but not a replacement for the current browser-facing model.

What was worth taking:
- broader Unicode coverage, e.g. missing CJK extension blocks

What was not worth taking:
- its segmentation as a runtime replacement for `Intl.Segmenter`
- its paragraph breaker as a substitute for browser-parity layout

Bottom line:
- good reference material
- wrong runtime center of gravity for this repo

## Discovery: preserving ordinary spaces, hard breaks, and numeric tab stops is viable

The smallest honest second whitespace mode turned out to be:
- preserve ordinary spaces
- preserve `\n` hard breaks
- preserve tabs with default browser-style tab stops
- leave the other wrapping defaults alone

That became:
- `{ whiteSpace: 'pre-wrap' }`

What mattered:
- preserved spaces still hang at line end
- consecutive hard breaks keep empty lines
- a trailing final hard break does **not** invent an extra empty line
- tabs advance to the next default browser tab stop from the current line start

The mode covers the textarea-like cases we cared about and earned a small permanent browser-oracle suite.

One important tooling lesson also came out of this:
- keep a small permanent oracle suite
- justify it once with a broader brute-force validation pass
- do not keep the brute-force pass forever once it has done its job

## Discovery: emoji canvas/DOM width discrepancy

Comparing canvas emoji width to `font-size` was the wrong model because bitmap emoji scale non-linearly. Comparing canvas width to actual DOM emoji width per font produced a capability-detected correction that could be cached outside the hot path. Current browser findings live in [PLATFORM_BUGS.md](PLATFORM_BUGS.md).

## Retired HarfBuzz probe path

We briefly kept a headless HarfBuzz backend in the repo for server-side measurement probes.

What it taught us:
- it was useful for research and algorithm probes
- it was not close enough to our active browser-grounded path to justify keeping it in the main repo
- isolated Arabic words in that probe path needed explicit LTR direction to avoid misleading widths

So if HarfBuzz comes up again later, treat it as explored territory:
- useful as a research reference
- not the runtime direction for Pretext
- not a substitute for browser-oracle or browser-canvas validation

## Safari/macOS shim audit

Rechecking the compatibility profile on Safari 26.4 confirmed that the line-fit tolerance, `keep-all` punctuation policy, and prefix-width fitting still earned their place. It also exposed `preferEarlySoftHyphenBreak` as dead duplication of the strict soft-hyphen boundary logic, so that branch was removed. Current evidence and limitations live in [PLATFORM_BUGS.md](PLATFORM_BUGS.md).

## Arabic frontier

Arabic took several passes, but the pattern is clearer now.

What survived:
- merge no-space Arabic punctuation clusters during `prepare()`
  - e.g. `فيقول:وعليك`, `همزةٌ،ما`
- treat Arabic punctuation-plus-mark clusters like `،ٍ` as left-sticky too
- split `" " + combining marks` into plain space plus marks attached to the following word
- use normalized slices and the exact corpus font during probe work
- trust the better RTL diagnostics path instead of reconstructing offsets from rendered line text
- clean obvious corpus/source artifacts instead of inventing new engine rules for them
- allow a tiny non-Safari line-fit tolerance bump for the positive fine-width field observed in the audit

What did **not** survive:
- pair correction models at segment boundaries
- larger Arabic run-slice width models
- broad phrase-level heuristics derived from one good-looking probe

Those failed for the same reason in different sizes:
- pair corrections were too local to move the real misses
- run-slice widths were much heavier and still did not move the hard widths enough
- both made `prepare()` or `layout()` materially worse without buying a clean Arabic field

So the useful guardrail is:
- if an Arabic idea starts by adding more shaping-aware width caches inside the current segment-sum architecture, be skeptical early
- the Arabic keeps so far have been preprocessing, corpus cleanup, diagnostics, and tiny tolerance shims, not richer width-cache models

## Long-form corpus lessons

Once the main browser sweep became a regression gate, the long-form corpora became the real steering canaries.

Durable keeps:
- escaped quote clusters
- numeric expressions like `२४×७`
- time ranges like `7:00-9:00`
- emoji ZWJ runs
- keeping chosen soft-hyphen breaks at the SHY boundary
- narrow structured URL/query units rather than one giant breakable blob
- contextual ASCII quote glue during preprocessing
- preserve explicit zero-width separators from the source text
- treat `၊` / `။` / `၍` / `၌` / `၏` as left-sticky during preprocessing
- treat `၏` as medial glue in clusters like `ကျွန်ုပ်၏လက်မ`
- kana iteration marks like `ゝ` / `ゞ` / `ヽ` / `ヾ` should be treated as CJK line-start-prohibited

Ideas rejected by broader evidence:
- accepting wrapped print/legal text as a `white-space: normal` canary
- broad Myanmar grapheme breaking in ordinary wrapping
- quote-follower glue like closing-quote + `ဟု`

The recurring lesson is to distinguish semantic preprocessing wins from the exactness ceiling of a width-independent segment-sum model. Cross-browser or font-sensitive one-line fields are evidence, not automatic invitations for another glue rule. Current counts and active fields live in [corpora/dashboard.json](corpora/dashboard.json).
