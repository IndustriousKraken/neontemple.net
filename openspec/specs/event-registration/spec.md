# event-registration Specification

## Purpose
TBD - created by archiving change event-register-link. Update Purpose after archive.
## Requirements
### Requirement: A registration affordance appears only for events the API marks registerable

The site SHALL render a registration affordance for an event if and only if that
event's API payload carries a non-empty `registration_url`, and SHALL render no
affordance whatsoever when the field is absent, null, or empty.

The site SHALL NOT infer registerability from any other field. In particular it
SHALL NOT derive it from `guest_price_cents`, `rsvp_required`, `max_attendees`, or
`visibility`, and SHALL NOT reconstruct the registration URL from an event id.
Whether the public may register for an event is an authorization decision made by
the backend; re-deriving it in the browser would duplicate that rule and drift
from it as soon as either side changed. Presence of the resolved URL is the whole
test.

Most events on this calendar are show-up events with no registration — the
recurring talks and open nights — and rendering nothing for them is the expected,
common outcome rather than a fallback.

#### Scenario: An ordinary weekly event shows no registration affordance

- **WHEN** the calendar renders an event whose payload has no `registration_url`
- **THEN** no badge, button, or registration link SHALL appear for it, and its
  card SHALL be laid out exactly as it is today

#### Scenario: A registerable event shows the affordance

- **WHEN** the calendar renders an event whose payload carries a valid
  `registration_url`
- **THEN** a registration affordance SHALL appear for that event

#### Scenario: A priced event without a registration URL still shows nothing

- **WHEN** an event payload carries a `guest_price_cents` but no
  `registration_url`
- **THEN** no affordance SHALL appear; a price alone SHALL NOT be treated as
  evidence that the public may register

### Requirement: The registration URL is scheme-validated before it reaches an href

The site SHALL accept a `registration_url` only when it parses as a URL whose
protocol is `http:` or `https:`, and SHALL render no registration affordance when
it does not.

A URL placed into an `href` is an injection sink: a `javascript:` value executes
in the page's origin when clicked. Attribute escaping does not prevent this, so
scheme validation is required in addition to the site's existing encoding rules.
The check SHALL apply even though the value originates from the site's own
backend, so that a misconfigured or compromised API cannot turn the calendar into
a script-execution vector.

A rejected URL SHALL fail closed and silently — no affordance, no broken link, no
console-visible error that would leak the malformed value into a shared log.

#### Scenario: A javascript: URL renders nothing

- **WHEN** an event payload carries a `registration_url` beginning with
  `javascript:`
- **THEN** no registration affordance SHALL be rendered and no anchor carrying
  that value SHALL be inserted into the DOM

#### Scenario: A relative or unparseable URL renders nothing

- **WHEN** an event payload carries a `registration_url` that is not an absolute
  `http`/`https` URL
- **THEN** no registration affordance SHALL be rendered

#### Scenario: An https URL is accepted

- **WHEN** an event payload carries an `https:` `registration_url`
- **THEN** the affordance SHALL render and link to that URL

### Requirement: The card carries a scannable badge and the modal carries the button

For a registerable event the card SHALL show a compact badge stating the cost —
the formatted `guest_price_cents`, or a free-registration label when that value is
zero — so the calendar can be scanned for the events that need signing up for.

The actionable control SHALL live in the event detail modal, not on the card. The
card is already a single click target that opens the modal, and nesting an
interactive control inside it would require suppressing click propagation to stop
one gesture from doing two things — complexity with no benefit to a reader who
reaches the same button one click later.

The modal's control SHALL be an anchor to the validated `registration_url`, SHALL
be labelled so its destination is clear before it is clicked, and SHALL state the
cost. Both badge and label SHALL be produced through the site's existing output
encoding rules, since the values originate from the API.

#### Scenario: The badge shows the price on the card

- **WHEN** a registerable event costing 3000 cents is rendered on the calendar
- **THEN** its card SHALL show a badge stating that price in a human-readable form

#### Scenario: A free registration-required event reads as free, not as zero

- **WHEN** a registerable event has `guest_price_cents` of `0`
- **THEN** the badge SHALL communicate that registration is free rather than
  displaying a zero currency amount

#### Scenario: The button is in the modal and links to the registration page

- **WHEN** a visitor opens the detail modal for a registerable event
- **THEN** the modal SHALL present an anchor pointing at the event's
  `registration_url`, stating the cost

#### Scenario: Opening the modal is still a single gesture

- **WHEN** a visitor clicks anywhere on a registerable event's card
- **THEN** the detail modal SHALL open, exactly as it does for a non-registerable
  event; the card SHALL NOT expose a second competing click target

