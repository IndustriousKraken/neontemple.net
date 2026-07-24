# Tasks

Opt-in: nothing renders until `turnstileSiteKey` is set, so the default build is
byte-identical to today.

## 1. Config + form

- [ ] 1.1 `hugo.toml`: add `turnstileSiteKey = ''` (public site key; empty = off).
- [ ] 1.2 `themes/terminal/layouts/_default/join.html`: when `turnstileSiteKey` is
  non-empty, load `https://challenges.cloudflare.com/turnstile/v0/api.js` and
  render `<div class="cf-turnstile" data-sitekey="…">` inside the signup form.
- [ ] 1.3 `themes/terminal/assets/js/main.js` `initSignupForm`: read
  `cf-turnstile-response` from the form data, send it as `captcha_token` (omit
  when absent), and `turnstile.reset()` on a failed submit.

## 2. Tests

- [ ] 2.1 Build with `turnstileSiteKey` set → `join/index.html` contains the
  Turnstile script and a `cf-turnstile` element with the key; build with it empty
  → neither is present.
- [ ] 2.2 `initSignupForm` includes `captcha_token` in the request when a
  `cf-turnstile-response` value is present, and omits it otherwise.

## 3. Verify

- [ ] 3.1 `openspec validate join-form-turnstile-widget --strict` passes.
- [ ] 3.2 `npm test` green; `hugo` builds (both key states).

## 4. Rollout (operator)

- [ ] 4.1 Set `turnstileSiteKey` (public) here and deploy the widget.
- [ ] 4.2 On the Coterie backend set `COTERIE__BOT_CHALLENGE__PROVIDER=turnstile`
  and `COTERIE__BOT_CHALLENGE__SECRET_KEY=<secret>` (or the admin UI once exposed),
  then restart. Widget-and-config first, provider-on last — the backend is
  fail-closed. Use Cloudflare test keys to validate end-to-end first.
