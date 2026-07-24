# join-form-turnstile-widget

## Why

The public signup funnel is targeted by card-testing bots. Coterie's backend
already verifies a Cloudflare Turnstile token on `POST /public/signup`
(fail-closed when a provider is configured), but the marketing join form never
renders a widget or sends a token — so the protection can't be turned on. This
adds the Turnstile widget to the join form and sends its token as `captcha_token`.

Opt-in and keyed by config: the widget appears only when a `turnstileSiteKey`
param is set, so nothing changes until the operator configures it (and pairs it
with the Coterie backend secret). The site key is public (rendered in the form);
the backend secret is never in this repo.

## What Changes

- New `turnstileSiteKey` param in `hugo.toml` (default empty).
- The join page loads the Turnstile script and renders the `cf-turnstile` widget
  in the signup form **only when** `turnstileSiteKey` is non-empty.
- `initSignupForm` reads the widget's `cf-turnstile-response` and sends it as
  `captcha_token` in the signup request; it resets the (single-use) widget on a
  failed submit so a retry mints a fresh token. When no key is configured, the
  request omits `captcha_token` exactly as today.
- No CSP change needed — the marketing site sets no Content-Security-Policy
  (Caddy sets only HSTS), so the Turnstile script host needs no allow-listing.

## Impact

- **Spec:** `signup-form` — 1 ADDED requirement (bot-challenge widget when
  configured). The existing membership-types and payment-funnel requirements are
  unchanged.
- **Code:** `hugo.toml` (param), `themes/terminal/layouts/_default/join.html`
  (conditional script + widget), `themes/terminal/assets/js/main.js`
  (`captcha_token` + reset-on-error).
- **Tests:** the join build renders the widget + script iff `turnstileSiteKey` is
  set; `initSignupForm` includes `captcha_token` when the widget's response is
  present.
- **Rollout:** ship the widget, set `turnstileSiteKey` (public) here and the
  Coterie backend `bot_challenge.provider=turnstile` + secret, THEN the backend
  fail-closed verification is safe to enable — widget-and-config first,
  provider-on last. Cloudflare test keys (`1x0000…AA` / always-pass secret) allow
  end-to-end verification before real keys.
