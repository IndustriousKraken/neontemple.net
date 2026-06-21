## Why

The site renders events and announcements fetched from the Coterie public API
(`themes/terminal/assets/js/api.js`). The rendering code treats every text field
from that API as untrusted and runs it through `escapeHtml()` before inserting it
into the DOM — every field *except* `image_url`, which is interpolated raw into
HTML attributes through `innerHTML`:

- `themes/terminal/assets/js/main.js:72` — event modal:
  `` `<a href="${imgUrl}" ...><img src="${imgUrl}" ...></a>` ``
- `themes/terminal/assets/js/main.js:108` — announcement modal: same pattern.
- `themes/terminal/assets/js/main.js:517` — full announcement card:
  `` `<img src="${getImageUrl(announcement.image_url)}" alt="">` ``
- `themes/terminal/assets/js/main.js:639` — event card:
  `` `<img src="${getImageUrl(event.image_url)}" alt="">` ``
- `themes/terminal/assets/js/main.js:663` — announcement card: same pattern.

`getImageUrl()` (`main.js:770`) returns the value verbatim when it starts with
`http://`/`https://` and otherwise only prepends a base URL — it performs no
escaping. An attacker who controls an `image_url` value returned by the API
(the data is a trust boundary; the surrounding code already treats it as
untrusted by escaping every other field) can set, for example:

```
image_url = 'https://evil.example/x.jpg"><img src=y onerror=alert(document.cookie)>'
```

The `"` closes the `src`/`href` attribute and the injected `<img onerror=...>`
executes arbitrary JavaScript in every visitor's browser the moment a card or
modal renders. **Harm: stored/DOM cross-site scripting** — session/credential
theft, defacement, and redirection of all site visitors.

Note: the existing `escapeHtml()` helper (`main.js:759`) builds its result via
`div.textContent = str; return div.innerHTML`, which escapes `&`, `<`, and `>`
but **not** `"` or `'`. It is therefore unsafe for HTML *attribute* contexts, so
the fix introduces an attribute-safe encoder rather than reusing `escapeHtml()`.

No canonical spec yet governs how API-sourced content is encoded for the DOM, so
this change establishes that contract.

## What Changes

- Add an attribute-safe encoder (escaping `&`, `<`, `>`, `"`, and `'`) and apply
  it to every `image_url`-derived value inserted into an HTML attribute via
  `innerHTML` (the two modals and the three card renderers).
- Apply the same encoding to the `image_url` used for the featured banner's
  `background-image` value (`main.js:306`) as defense in depth.
- Establish a `content-rendering` capability requirement: every untrusted API
  field value inserted into the DOM is encoded for its output context, including
  URL/`image_url` values placed in attributes.

## Impact

- `themes/terminal/assets/js/main.js` (modals, card renderers, banner, encoder
  helper).
- The generated bundle under `public/js/` is rebuilt by Hugo from the theme
  asset; no hand edit there.
- New capability spec: `content-rendering`.
