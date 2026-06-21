## 1. Add an attribute-safe encoder

- [x] 1.1 In `themes/terminal/assets/js/main.js`, add a helper
  `escapeAttr(str)` that returns `''` for falsy input and otherwise replaces
  `&`, `<`, `>`, `"`, and `'` with their HTML entity equivalents
  (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Do NOT reuse `escapeHtml`, which
  leaves `"` and `'` unescaped and is unsafe for attribute contexts.

## 2. Encode every image_url inserted into an attribute

- [x] 2.1 In `showEventModal` (`main.js:72`), wrap the `imgUrl` used in the
  `href` and `src` attributes with `escapeAttr(...)`.
- [x] 2.2 In `showAnnouncementModal` (`main.js:108`), wrap the `imgUrl` used in
  the `href` and `src` attributes with `escapeAttr(...)`.
- [x] 2.3 In `renderAnnouncementCardFull` (`main.js:517`), wrap
  `getImageUrl(announcement.image_url)` with `escapeAttr(...)`.
- [x] 2.4 In `renderEventCard` (`main.js:639`), wrap
  `getImageUrl(event.image_url)` with `escapeAttr(...)`.
- [x] 2.5 In `renderAnnouncementCard` (`main.js:663`), wrap
  `getImageUrl(announcement.image_url)` with `escapeAttr(...)`.
- [x] 2.6 In `renderFeaturedBanner` (`main.js:306`), encode the `imgUrl` used in
  the `background-image: url(...)` value (e.g. via `escapeAttr` or by rejecting
  values containing `"`, `)`, or whitespace) before assigning
  `banner.style.backgroundImage`.

## 3. Regression test

- [x] 3.1 Add a test (e.g. under a `themes/terminal/assets/js/` test harness or
  a jsdom-based unit test) named `image_url_with_attribute_breakout_is_neutralized`
  that renders an event whose `image_url` is
  `https://x"><img src=y onerror=window.__xss=1>` and asserts that, after
  rendering, no element with an `onerror` handler is injected and
  `window.__xss` is undefined.
- [x] 3.2 Add a test `image_url_normal_value_still_renders` asserting that a
  plain `https://example.com/a.jpg` value still appears as the `<img>` `src`.

## 4. Encode API-sourced ids placed in inline event handlers

The same trust boundary applies to the `id` interpolated into the five
`onclick="showXModal('${id}')"` sites. That is a JS-string-inside-an-HTML-
attribute context: the HTML parser decodes entities before the JS engine runs,
so `escapeAttr` is unsafe here (its `&#39;` decodes back to `'` and reopens the
breakout). The `id` is also the `contentStore` lookup key, so the encoding must
round-trip the value exactly — which rules out a character-rejection approach.

- [x] 4.1 In `themes/terminal/assets/js/main.js`, add a helper `escapeJsAttr(value)`
  that returns `''` for nullish input and otherwise JS-escapes `\`, `'`, `\r`,
  `\n` (so the value survives HTML decoding without breaking the single-quoted
  JS string) and then HTML-entity-encodes `&`, `"`, `<`, `>` (so it cannot break
  the surrounding double-quoted attribute).
- [x] 4.2 Wrap the `id` at all five inline-handler sites with `escapeJsAttr(...)`:
  `renderFeaturedBanner` hero (`main.js:314`) and text banner (`main.js:326`),
  `renderAnnouncementCardFull` (`main.js:526`), `renderEventCard` (`main.js:648`),
  and `renderAnnouncementCard` (`main.js:672`).
- [x] 4.3 Add regression tests `onclick_id_with_quote_breakout_is_neutralized`
  (renders a card whose `id` is `1');window.__xss=1;//`, then HTML-decodes and
  executes the rendered handler as a browser would, asserting the modal function
  is called exactly once with the original `id` and `window.__xss` stays
  undefined), `onclick_id_normal_value_round_trips`, and an `escapeJsAttr` unit
  test.
