# Tasks

## 1. Implementation (landed 2026-07-21, interactive session)

- [x] 1.1 Add `truncateHtml(html, length)` to
  `themes/terminal/assets/js/main.js`: visible-character budget, entities never
  split and counted as one, inline-tag whitelist re-emitted bare, block tags
  unwrapped to a space, links unwrapped to text, open tags closed after the
  ellipsis.
- [x] 1.2 Add `previewHtml(announcement, length)`: `truncateHtml(content_html)`
  when present, `escapeHtml(truncate(content))` fallback otherwise.
- [x] 1.3 Route the featured hero (120), featured banner (80), homepage card
  (120), and announcements-page card (250) previews through `previewHtml`.
- [x] 1.4 Update the modal comment that claimed previews never render
  `content_html`.

## 2. Tests

- [x] 2.1 Replace the `main.test.js` assertion that card previews never render
  `content_html` with assertions that inline tags from `content_html` render in
  previews while the title stays escaped text.
- [x] 2.2 Add `truncateHtml` unit tests: balanced cut inside nested tags,
  entity counting, block/list unwrapping to spaced text, link unwrapping and
  attribute dropping, `del` survival, no-ellipsis pass-through of short input.
- [x] 2.3 Add a fallback test: preview of an announcement without
  `content_html` renders raw `content` as escaped text.
