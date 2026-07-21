# announcement-preview-inline-html

## Why

The `announcement-content-html-rendering` change scoped `content_html` to the
full-body modal and deliberately kept card/banner previews as escaped raw
`content`, because naive truncation of HTML can cut a tag in half. The result:
Markdown announcements show literal `~~strikethrough~~` and `*emphasis*`
punctuation in the featured hero/banner and in the announcement card summaries —
formatting (and the jokes that depend on it) only survives in the modal.

Truncating sanitized HTML safely is tractable when done structurally. This
change extends `content_html` consumption to preview surfaces via a
structure-preserving truncation, superseding the previous "previews stay plain
text" decision.

**Note:** this change is retroactive — the implementation landed in an
interactive session on 2026-07-21 and this change trues canon up to it.

## What Changes

- A `truncateHtml(html, length)` helper truncates Coterie's server-sanitized
  `content_html` to a budget of **visible** characters (a character entity
  counts as one) without ever splitting a tag or entity. Only a fixed whitelist
  of inline formatting tags (`em`, `strong`, `del`, `s`, `code`, `sub`, `sup`,
  `mark`, `u`, `i`, `b`) is kept, re-emitted bare so no attributes pass
  through. Block tags unwrap to a space separator; links unwrap to their text
  (previews sit inside `onclick` cards — a nested `<a>` would nest click
  targets). Tags still open at the cut are closed after the ellipsis, so the
  emitted fragment is always balanced.
- A `previewHtml(announcement, length)` helper routes all four preview surfaces
  (featured hero, featured banner, homepage announcement cards,
  announcements-page cards) through `truncateHtml(content_html)` when the API
  provides `content_html`, and falls back to the previous escaped-text
  truncation of raw `content` when it is absent (older API).
- The modal's full-body `content_html` rendering is unchanged.

## Impact

- **Spec:** `content-rendering` — 1 MODIFIED requirement: the `content_html`
  carve-out widens from "modal only, previews never" to "modal as-is; previews
  only through structure-preserving inline truncation". All existing scenarios
  retained.
- **Code:** `themes/terminal/assets/js/main.js` — new `truncateHtml` /
  `previewHtml` helpers; the four preview call sites use `previewHtml`.
- **Tests:** `main.test.js` — the case asserting previews never render
  `content_html` is replaced by cases asserting inline-truncated rendering,
  balanced cuts, entity counting, block/link unwrapping, attribute dropping,
  and the escaped-text fallback.
