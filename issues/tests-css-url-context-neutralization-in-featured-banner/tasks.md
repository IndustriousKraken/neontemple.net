## 1. Add CSS url() context regression tests for the featured banner

- [ ] 1.1 In `themes/terminal/assets/js/main.test.js`, add a loader that runs
  `main.js` in a fresh `vm` sandbox with:
  - `document.getElementById('announcement-banner')` returning a fake banner
    element exposing a mutable `style` object, a `classList` with no-op
    `add`/`remove`, an `innerHTML` setter/getter, a settable `className`, and a
    no-op `addEventListener`;
  - `document.addEventListener` and `document.createElement` stubs (as in the
    existing `loadMain` helper); and
  - no-op `setInterval` / `clearInterval`.
  Drive rendering by stubbing `CoterieAPI.getAnnouncements` to return a **single**
  featured announcement (one item avoids starting the rotation timer) and
  `await sandbox.initAnnouncementBanner()`.
- [ ] 1.2 `featured_banner_drops_image_url_with_css_breakout` — set the featured
  announcement's `image_url` to a value containing CSS-`url()`-breakout
  characters (e.g. `https://x") ; background:url(evil) "`) and assert the banner's
  `style.backgroundImage` is the empty string `''` after rendering.
- [ ] 1.3 `featured_banner_renders_well_formed_image_url` — set `image_url` to
  `https://cdn.example.com/a.jpg` and assert the banner's `style.backgroundImage`
  is exactly `url("https://cdn.example.com/a.jpg")`.
