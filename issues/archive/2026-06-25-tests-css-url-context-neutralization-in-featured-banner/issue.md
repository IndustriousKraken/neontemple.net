# Coverage gap: the CSS `url()` context for `image_url` is untested

## Gap

The `content-rendering` canon — requirement **"Untrusted API field values are
encoded for their DOM output context"**
(`openspec/specs/content-rendering/spec.md`) — requires that an `image_url` placed
into an HTML attribute "such as an `href`, `src`, or **inline `style` `url(...)`**"
be encoded so it cannot terminate the attribute or introduce additional markup.

`renderFeaturedBanner` (`themes/terminal/assets/js/main.js:278-334`) is the one
site that inserts an `image_url` into a CSS `background-image: url("...")` context.
HTML-entity encoding is not decoded inside a CSS `url()`, so the code instead
**drops the URL entirely** when it contains any character that could break out of
`url("...")` — quotes, parentheses, backslashes, or whitespace
(`main.js:310`) — and otherwise wraps it as `url("<url>")` (`main.js:311`).

The existing regression tests in `themes/terminal/assets/js/main.test.js` cover
only two of the three contexts the canon names: the `src`/`href` attribute
context (`escapeAttr`, via `renderEventCard`) and the inline `onclick` handler
context (`escapeJsAttr`). **No test exercises the CSS `url()` branch.** A
regression that re-introduced the raw `image_url` into the `background-image`
value — re-opening a CSS-injection / breakout — would pass the current suite
unnoticed.

## Source location

- `themes/terminal/assets/js/main.js:278-334` — `renderFeaturedBanner`, in
  particular the `cssSafeUrl` sanitizer at `main.js:310-311`.
- Reached through `initAnnouncementBanner` (`themes/terminal/assets/js/main.js:215-247`),
  which populates `featuredBannerState` and calls `renderFeaturedBanner`.

## Acceptance criteria

These tests assert the **existing** canonical requirement *"Untrusted API field
values are encoded for their DOM output context"*
(`openspec/specs/content-rendering/spec.md`) for the `inline style url(...)`
output context it already names. They pin behavior the spec already implies — **no
contract change is involved** (this is why the unit carries no spec delta).

- A featured announcement whose `image_url` contains a CSS-`url()`-breakout
  payload (any value containing `"`, `'`, `(`, `)`, `\`, or whitespace) results
  in an empty `background-image` after rendering — the URL is dropped, so no
  attacker-controlled value reaches the rendered banner's CSS.
- A featured announcement whose `image_url` is a well-formed URL with none of
  those characters renders as `background-image: url("<url>")`.
