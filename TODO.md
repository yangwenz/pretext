Current priorities:

1. Evidence-led engine work

- Use the split `analyze()` / `measure()` benchmark rows to steer `prepare()` work and the chunk-heavy rich rows to steer streaming work.
- Use the synthetic long-breakable-run canary for Safari prefix-width changes; retained-heap wins are not worth a meaningful `prepare()` regression.
- Chinese is the clearest active CJK canary. Treat strongly font- or shaping-sensitive fields in Chinese, Myanmar, and Urdu as architecture boundaries until broader evidence points to a real rule.
- Keep `layout()` simple and allocation-light. Rich/manual performance work belongs in the range and cursor APIs.

2. Canary coverage

- Keep mixed app text as the product-shaped regression canary. Add only real classes that the current corpus misses.
- Add corpora only from clean source text, and expand the font matrix only around a genuinely imperfect canary.
- Prefer a new Southeast Asian source that broadens coverage over another wrapped legal or raw-source artifact.

3. Demo work

- Keep the editorial demos as the dogfood path for the rich line APIs.
- Prefer `layoutNextLine()` / `walkLineRanges()` when a demo is really about streaming or obstacle-aware layout.
- Add a new demo only if it exposes something the current editorial demos do not already cover.

Open design questions:

- Whether line-fit tolerance should stay as a browser shim or move toward runtime calibration.
- Whether `{ whiteSpace: 'pre-wrap' }` should grow beyond spaces / tabs / `\n`.
- Whether strong real-world demand for `system-ui` would justify a narrow prepare-time DOM fallback.
- Whether server canvas support should become an explicit supported backend.
- Whether automatic hyphenation beyond manual soft hyphen is in scope.
- Whether intrinsic sizing / logical width APIs are needed beyond fixed-width height prediction.
- Whether bidi rendering concerns like selection and copy/paste belong here or stay out of scope.
- Whether a separate optional slow verify path is worth having as a diagnostic mode, without contaminating `layout()`.
