# join-form-live-membership-types

## Why

The join form is disconnected from the backend it signs members up to,
four ways:

1. Its membership-type `<select>` hardcodes a single option
   (`standard`) that is not a configured Coterie type.
2. The field is named `membership_type` but Coterie's
   `POST /public/signup` reads `membership_type_slug` — so whatever the
   visitor picks is silently ignored and every signup falls through to
   the org-default type.
3. The password `minlength="8"` disagrees with Coterie's enforced
   minimum of 10, so the browser green-lights passwords the backend
   rejects.
4. Coterie's pay-at-signup funnel (signup response carries
   `checkout_url` when the org runs `signup_mode=payment`) has no
   client: the form shows the "check your email" success message and
   the visitor never reaches Stripe Checkout.

Coterie now exposes `GET /public/membership-types` (active types with
slug, name, description, fee, billing period) precisely so this form
can render real choices.

## What Changes

- `CoterieAPI.getMembershipTypes()` — thin GET on
  `/public/membership-types`.
- The join form's select is populated from that endpoint at page load
  (option value = `slug`, label = name + formatted fee/period, via a
  pure `formatMembershipOption` helper). If the endpoint fails or
  returns no types, the type field is hidden and signup proceeds
  without a slug (Coterie applies the org default) — the form degrades,
  it doesn't break.
- The field is renamed `membership_type_slug`; an empty selection is
  omitted from the payload (Coterie 400s on an unknown — including
  empty — slug).
- On signup success: when the response carries `checkout_url`, the
  browser is redirected there to complete payment; otherwise the
  existing "check your email" success message renders.
- Password `minlength` raised to 10 to match the backend validator.

## Impact

- Spec: `api-client` — 1 ADDED requirement; new capability
  `signup-form` — 2 ADDED requirements.
- Code: `themes/terminal/assets/js/api.js`, `main.js`,
  `themes/terminal/layouts/_default/join.html`.
- Tests: `api.test.js` (endpoint contract), `main.test.js`
  (`formatMembershipOption` cases) — same vm-sandbox style as the
  existing suites.
