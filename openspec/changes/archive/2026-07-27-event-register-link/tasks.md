# Tasks

Depends on Coterie's `a42-paid-events-guest-registration` for the
`registration_url` / `guest_price_cents` fields on `/public/events`. Until that
ships the fields are absent and every task below renders nothing — the change is
safe to land first and degrades to today's behavior.

## 1. URL validation

- [x] 1.1 Add a `safeRegistrationUrl(value)` helper in
  `themes/terminal/assets/js/main.js`: returns the URL string only when it parses
  via `new URL(...)` and its protocol is `http:` or `https:`; returns `null`
  otherwise. Wrap the parse in try/catch — `new URL` throws on garbage.
- [x] 1.2 Fail closed and quietly: no console output carrying the rejected value.

## 2. Price formatting

- [x] 2.1 Add a small formatter turning `guest_price_cents` into display text:
  a currency amount for a positive value, and a free-registration label for `0`.
  Never render "$0.00" — it reads as a bug to a visitor.

## 3. Card badge

- [x] 3.1 In `renderEventCard`, when `safeRegistrationUrl(event.registration_url)`
  is non-null, add a badge element carrying the formatted price. Skip entirely
  otherwise — no empty wrapper, no whitespace, no layout shift for the weekly
  events.
- [x] 3.2 Route the badge text through the existing escaping helpers, per
  `content-rendering`.
- [x] 3.3 Do NOT make the badge clickable; the card's existing `onclick` stays the
  only click target.

## 4. Modal button

- [x] 4.1 In `showEventModal`, render an anchor to the validated URL with a label
  naming the action and the cost. Omit the whole block when the URL is absent or
  rejected.
- [x] 4.2 Give it `rel="noopener"` if it opens in a new tab; decide one behavior
  and apply it consistently.
- [x] 4.3 Clear the block on every modal open so a previously-viewed registerable
  event cannot leave its button behind on a later non-registerable one. The modal
  is reused across events — this is the bug that class of code always has.

## 5. Styling

- [x] 5.1 Badge and button styles in the theme's CSS, matching existing card and
  button conventions rather than introducing a new visual language.
- [x] 5.2 Verify the badge reads correctly in both the calendar grid and the
  home-page upcoming list, since `renderEventCard` serves both.

## 6. Tests / verification

- [x] 6.1 An event with no `registration_url` renders no badge and no button.
- [x] 6.2 A `javascript:` URL renders neither, and inserts no anchor.
- [x] 6.3 A zero-price registerable event reads as free, not `$0.00`.
- [x] 6.4 Opening a registerable event's modal then a non-registerable one leaves
  no stale button.
- [x] 6.5 Build with `hugo --gc --minify` and confirm the calendar and home page
  render unchanged for the current all-free event set.
