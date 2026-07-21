# Design notes — announcement-content-html-rendering

Guidance, not contract. Binding contract is `specs/content-rendering/spec.md`.

## Why inserting `content_html` as HTML is safe here

This site's rule is "encode untrusted API values before they reach the DOM."
`content_html` is the one value that is NOT untrusted: Coterie renders the
announcement Markdown to HTML server-side with raw-HTML passthrough disabled and
runs it through an HTML sanitizer (ammonia whitelist — safe tag subset, no
`script`/`img`/event handlers, only `http`/`https`/`mailto` link schemes). The
trust rests entirely on that server-side sanitization. So the boundary is:

- **`content_html`** → trusted safe HTML → `innerHTML`, modal only.
- **everything else** (`title`, raw `content`, `image_url`, `id`, …) → untrusted
  → text / context-encoded, exactly as today.

If we ever consumed `content_html` from a source we do not control, this
carve-out would not hold — the safety is specifically that our own backend
sanitized it.

## Details

- `showAnnouncementModal` sets the modal body from `content_html` when present,
  falling back to `textContent = content` when it is absent (older API / missing
  field) so the modal never renders raw tags or breaks.
- Previews (`renderAnnouncementCard`, `renderAnnouncementCardFull`) are unchanged:
  they truncate the raw `content` and escape it. Do NOT truncate `content_html`.
- No new dependency: no client-side Markdown parser or sanitizer is introduced —
  the browser only inserts already-sanitized HTML.
