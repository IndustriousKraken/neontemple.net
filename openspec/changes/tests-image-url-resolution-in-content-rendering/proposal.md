## Why

`getImageUrl` (`themes/terminal/assets/js/main.js:823-832`; duplicated as a
component method in `themes/terminal/assets/js/calendar.js:134-141`) resolves an
API-supplied image path to the URL that every event/announcement image is rendered
from. It branches three ways:

- a falsy path → `''` (`main.js:824`);
- a value already starting with `http://` or `https://` → returned unchanged
  (`main.js:826-828`); and
- any other (relative) path → joined to the configured API base URL
  (`window.COTERIE_API_URL`, or `''` when unset) with a single `/`
  (`main.js:830-831`).

Only the absolute-URL branch is covered, and only indirectly: the existing
`image_url_normal_value_still_renders` test in `main.test.js` renders a card with
an `https://` URL. The **relative-path resolution** branch (base prepended), the
**base-unset** sub-case (path rooted at `/`), and the **falsy-input** guard have
no assertions. A wrong base or a wrong separator would break every relative image
across the site, and nothing would catch it.

The `content-rendering` canon currently specifies how a well-formed `image_url`
*renders* (its `src` resolves to the same absolute URL) and how breakout payloads
are *encoded*, but it does not state how a **relative** path is resolved to an
absolute URL. This change adds that resolution invariant and the tests for it.

## What Changes

- Add tests in `themes/terminal/assets/js/main.test.js` for `getImageUrl`:
  absolute `http`/`https` returned unchanged; a relative path joined to a
  configured `COTERIE_API_URL`; a relative path rooted at `/` when no base is
  configured; and a falsy path resolving to `''`.
- Add a `content-rendering` capability requirement specifying image-path
  resolution by `getImageUrl`.

## Impact

- Test file: `themes/terminal/assets/js/main.test.js` (new tests; no production
  code change).
- Capability spec: `content-rendering` (one ADDED requirement, orthogonal to the
  existing encoding requirement).
