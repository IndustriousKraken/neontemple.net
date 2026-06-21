## 1. Add an attribute-safe encoder

- [ ] 1.1 In `themes/terminal/assets/js/main.js`, add a helper
  `escapeAttr(str)` that returns `''` for falsy input and otherwise replaces
  `&`, `<`, `>`, `"`, and `'` with their HTML entity equivalents
  (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Do NOT reuse `escapeHtml`, which
  leaves `"` and `'` unescaped and is unsafe for attribute contexts.

## 2. Encode every image_url inserted into an attribute

- [ ] 2.1 In `showEventModal` (`main.js:72`), wrap the `imgUrl` used in the
  `href` and `src` attributes with `escapeAttr(...)`.
- [ ] 2.2 In `showAnnouncementModal` (`main.js:108`), wrap the `imgUrl` used in
  the `href` and `src` attributes with `escapeAttr(...)`.
- [ ] 2.3 In `renderAnnouncementCardFull` (`main.js:517`), wrap
  `getImageUrl(announcement.image_url)` with `escapeAttr(...)`.
- [ ] 2.4 In `renderEventCard` (`main.js:639`), wrap
  `getImageUrl(event.image_url)` with `escapeAttr(...)`.
- [ ] 2.5 In `renderAnnouncementCard` (`main.js:663`), wrap
  `getImageUrl(announcement.image_url)` with `escapeAttr(...)`.
- [ ] 2.6 In `renderFeaturedBanner` (`main.js:306`), encode the `imgUrl` used in
  the `background-image: url(...)` value (e.g. via `escapeAttr` or by rejecting
  values containing `"`, `)`, or whitespace) before assigning
  `banner.style.backgroundImage`.

## 3. Regression test

- [ ] 3.1 Add a test (e.g. under a `themes/terminal/assets/js/` test harness or
  a jsdom-based unit test) named `image_url_with_attribute_breakout_is_neutralized`
  that renders an event whose `image_url` is
  `https://x"><img src=y onerror=window.__xss=1>` and asserts that, after
  rendering, no element with an `onerror` handler is injected and
  `window.__xss` is undefined.
- [ ] 3.2 Add a test `image_url_normal_value_still_renders` asserting that a
  plain `https://example.com/a.jpg` value still appears as the `<img>` `src`.
