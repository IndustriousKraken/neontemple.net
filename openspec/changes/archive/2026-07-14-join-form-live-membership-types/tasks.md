# Tasks

## 1. API client

- [x] 1.1 Add `CoterieAPI.getMembershipTypes()` requesting
  `/public/membership-types` through the shared fetch wrapper.

## 2. Join form

- [x] 2.1 `join.html`: rename the select to `membership_type_slug`,
  replace the hardcoded option with a "Loading…" placeholder, and set
  the password `minlength` to 10.
- [x] 2.2 `main.js`: add pure top-level `formatMembershipOption(type)`
  ("Name — $45/month", "Name — Free", "Name — $500 lifetime") and an
  async populate step in `initSignupForm` that fills the select from
  `getMembershipTypes()`; on error or an empty list, hide the type
  form-group so signup proceeds slug-less.
- [x] 2.3 Submit handler: drop an empty `membership_type_slug` from the
  payload; on a success response containing `checkout_url`, redirect
  the browser there; otherwise keep the existing success message.

## 3. Tests

- [x] 3.1 `api.test.js`: `getMembershipTypes` requests
  `/public/membership-types` (bare endpoint, no query).
- [x] 3.2 `main.test.js`: `formatMembershipOption` renders paid-monthly,
  paid-yearly, lifetime, and free variants; fee cents format to whole
  dollars without trailing `.00` and to cents otherwise.
