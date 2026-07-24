# signup-form Specification

## ADDED Requirements

### Requirement: The join form presents a bot-challenge widget when configured

The join form SHALL render a Cloudflare Turnstile bot-challenge widget when a
Turnstile site key is configured, and SHALL send the widget's token with the
signup request. Specifically: when the `turnstileSiteKey` param is non-empty, the
join page SHALL load the Turnstile script and render its `cf-turnstile` widget in
the signup form, and `initSignupForm` SHALL include the widget's response token as
the `captcha_token` field of the signup request. When `turnstileSiteKey` is empty,
no widget or script SHALL be loaded and the request SHALL omit `captcha_token`
(unchanged from prior behavior). Because the token is single-use, a failed submit
SHALL reset the widget so a retry obtains a fresh token.

#### Scenario: Widget and token are present when configured

- **WHEN** `turnstileSiteKey` is set and the join page is built
- **THEN** the page SHALL load the Turnstile script and render a `cf-turnstile`
  element carrying that site key, and a signup submit SHALL include the widget's
  token as `captcha_token`

#### Scenario: No widget when unconfigured

- **WHEN** `turnstileSiteKey` is empty
- **THEN** the join page SHALL load no Turnstile script or widget, and a signup
  submit SHALL omit `captcha_token`

#### Scenario: A failed submit resets the single-use token

- **WHEN** a signup submit fails and the Turnstile widget is present
- **THEN** the widget SHALL be reset so a subsequent submit sends a fresh token
