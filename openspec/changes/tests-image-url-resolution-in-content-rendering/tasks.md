## 1. Add image-path resolution tests for getImageUrl

- [ ] 1.1 `getImageUrl_returns_absolute_url_unchanged` — load `main.js` via the
  existing `loadMain()` helper and assert `getImageUrl('https://cdn.example.com/a.jpg')`
  and `getImageUrl('http://cdn.example.com/a.jpg')` are each returned unchanged.
- [ ] 1.2 `getImageUrl_joins_relative_path_to_configured_base` — after
  `loadMain()`, set `sandbox.window.COTERIE_API_URL = 'https://api.test'`
  (`getImageUrl` reads `window.COTERIE_API_URL` at call time), then assert
  `getImageUrl('uploads/a.jpg')` returns `'https://api.test/uploads/a.jpg'`.
- [ ] 1.3 `getImageUrl_roots_relative_path_when_base_unset` — with no
  `window.COTERIE_API_URL` set on the sandbox, assert `getImageUrl('uploads/a.jpg')`
  returns `'/uploads/a.jpg'`.
- [ ] 1.4 `getImageUrl_returns_empty_string_for_falsy_input` — assert
  `getImageUrl('')` and `getImageUrl(null)` both return `''`.
