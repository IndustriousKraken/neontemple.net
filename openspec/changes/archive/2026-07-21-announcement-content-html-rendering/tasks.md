# Tasks

The `content_html` carve-out is a security boundary: it is trusted ONLY because
Coterie sanitizes it server-side. Everything else stays untrusted.

## 1. Render content_html in the modal

- [x] 1.1 `themes/terminal/assets/js/main.js` — in `showAnnouncementModal`, set
  the modal body from `announcement.content_html` via `innerHTML` when that field
  is present; fall back to `textContent = announcement.content` when it is absent
  (older API). Do not introduce any client-side Markdown/sanitizer library.
- [x] 1.2 Leave `renderAnnouncementCard` / `renderAnnouncementCardFull` previews
  unchanged — they truncate the raw `content` and escape it. Never truncate or
  `innerHTML` `content_html`.

## 2. Tests

- [x] 2.1 `main.test.js`: given an announcement with
  `content_html = '<p>hi <strong>there</strong></p>'`, opening the modal yields a
  body containing a `<strong>` element (formatting rendered).
- [x] 2.2 `main.test.js`: given an announcement whose `title` and raw `content`
  contain `<script>alert(1)</script>`, the title/preview render it as inert text
  (mirror the existing encoding-assertion style — assert no live `<script>`).
- [x] 2.3 `main.test.js`: with `content_html` absent, the modal falls back to the
  text `content` (no raw tags rendered).

## 3. Verify

- [x] 3.1 `openspec validate announcement-content-html-rendering --strict` passes.
- [x] 3.2 `npm test` green; `hugo` builds. (npm test: 38/38 pass. `hugo` is not
  installed in this sandbox; this change touches only the leaf JS asset and its
  test — no Hugo templates/config/content — and the file stays valid JS, so the
  build has no changed inputs to break. Operator/CI runs the hugo build.)

## 4. Sequencing

- [x] 4.1 Deploy alongside Coterie's `content_html` (its
  `announcement-markdown-rendering` change). The text fallback in 1.1 keeps the
  modal correct if this ships first. (Deployability satisfied in code by the 1.1
  fallback; the actual co-deploy is an operator action at release time.)
