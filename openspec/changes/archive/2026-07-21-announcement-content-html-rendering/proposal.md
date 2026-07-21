# announcement-content-html-rendering

## Why

Coterie is adding server-rendered, **sanitized** Markdown for announcement
bodies (its `announcement-markdown-rendering` change): `/public/announcements`
will carry a new `content_html` field that is already safe HTML. Today this site
renders the announcement body with `textContent`
(`themes/terminal/assets/js/main.js:128`), so Markdown shows as literal
punctuation. This change consumes `content_html` so formatting (bold, italic,
strikethrough, lists, links) actually renders.

This is a companion to the Coterie change and must ship together: it depends on
the API field Coterie adds.

## What Changes

- The announcement **modal** renders `announcement.content_html` via `innerHTML`
  instead of `announcement.content` via `textContent`. `content_html` is
  server-sanitized by Coterie (raw HTML disabled, whitelist, safe URL schemes),
  so inserting it as HTML is safe.
- **Card/preview surfaces stay plain text.** Previews truncate the raw `content`
  and escape it as today — truncating sanitized HTML could cut mid-tag, so
  `content_html` is only used for the full-body modal render.
- All other announcement fields (`title`, raw `content`, `image_url`, `id`, …)
  remain untrusted and continue to be inserted as text / encoded exactly as
  before. `content_html` is the single carve-out.

## Impact

- **Spec:** `content-rendering` — 1 MODIFIED requirement (the trust rule gains an
  explicit `content_html` exception). No new capability.
- **Code:** `themes/terminal/assets/js/main.js` — `showAnnouncementModal` sets
  the modal body from `content_html` (fallback to text `content` when the field
  is absent, e.g. an older API); `renderAnnouncementCard` /
  `renderAnnouncementCardFull` previews unchanged (still text).
- **Tests:** a `main.test.js` case asserting the modal body renders a sanitized
  HTML element from `content_html`, and that a `<script>` in `title`/raw
  `content` is still inserted as inert text.
- **Sequencing:** land with Coterie's `content_html`. The text fallback keeps the
  modal working if this deploys before the API field exists.
