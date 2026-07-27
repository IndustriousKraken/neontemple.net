# event-register-link

## Why

Coterie is gaining paid and registration-required events (`a41`–`a43` in the
Coterie repo). The marketing site is where the public actually sees the calendar,
so it needs to offer a way in — but only for the handful of events that want one.

The shape of this org's calendar matters to the design: **almost every event is a
show-up event.** The weekly Thursday talks and HackTheBox nights have no price, no
seat list, and no registration — you turn up at 7pm. A few times a year there is a
workshop or a multi-day class that genuinely needs a seat list. A Register button
on every card would be noise on ~95% of them and would train people to ignore it
exactly when it starts to matter.

So the affordance is **opt-in per event and absent by default**.

## What Changes

- Event cards and the event detail modal SHALL show a registration affordance
  **only** when the API says the event is registerable.
- The signal is a single field: `registration_url` on the `/public/events`
  projection, which Coterie populates only for events that are `Public` and have
  guest registration enabled. When it is absent, nothing renders.
- The site SHALL NOT re-derive registerability from price, `rsvp_required`, or
  `visibility`. Whether the public may register is an authorization decision that
  lives in Coterie; a second implementation here would drift from it the moment
  either side changes. One field, tested for presence.
- The card gets a compact badge (the price, or "Register" when free) so the
  calendar can be scanned; the **modal** carries the actual button, because the
  card is already a click target and nesting an interactive control inside it
  means fighting event propagation for no user benefit.
- `registration_url` is rendered into an `href`, so it is scheme-validated before
  use — see below.

## Security

`registration_url` arrives from the API and lands in an `href`. Even though it
originates from our own backend, a URL rendered into an anchor is an injection
sink: a `javascript:` value would execute in the page's origin. The existing
`content-rendering` escaping rules cover attribute encoding but not scheme
validation, which is the specific risk here.

So the URL is accepted only when it parses and uses `http:` or `https:`; anything
else renders no affordance at all. This is cheap, and it means a
misconfigured or compromised backend cannot turn the calendar into an XSS vector.

## Impact

- **Spec:** new capability `event-registration` (3 ADDED requirements). No
  existing capability is modified — `api-client` needs no change because the new
  fields ride along in the existing `getEvents` response, and `content-rendering`'s
  escaping rules already apply to the rendered values.
- **Code:** `themes/terminal/assets/js/main.js` — `renderEventCard` gains the
  badge, `showEventModal` gains the button, plus a small URL-validation helper.
  A little CSS for the badge and button.
- **Depends on:** the Coterie-side `a42-paid-events-guest-registration`, which
  adds `registration_url` and `guest_price_cents` to `/public/events`. Until that
  ships, the field is simply absent and this change renders nothing — it degrades
  to today's behavior rather than breaking.
- **Behavior for the weekly talks:** unchanged. No badge, no button, no layout
  shift.
- **Deferred:** registration status on the card (e.g. "3 seats left"), which would
  need capacity in the public projection and go stale in a cached page anyway.
