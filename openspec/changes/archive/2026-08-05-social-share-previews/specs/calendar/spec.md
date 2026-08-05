# calendar Specification Delta

## MODIFIED Requirements

### Requirement: A calendar event has a shareable direct link

An open event modal SHALL reflect the event in the page URL as a calendar URL
carrying a month parameter and an `#event-<id>` fragment, so the address bar
records which event is open and the browser's history controls work. It SHALL
offer a copy control that puts the event's **share page** URL on the clipboard.

The copy control SHALL copy the share page URL, not the calendar deep link. The
two serve different purposes and only one of them survives being pasted
elsewhere: the calendar deep link carries the open event in a fragment, which a
crawler never receives, so a preview of it can only ever describe the calendar.
The share page is a real page per event and previews as that event. Reflecting
state in the address bar and producing a link fit to share are two jobs, and this
control does the second.

The month parameter SHALL be derived from the event's own start time in the
event's own timezone — the same day-bucketing the calendar grid uses — and SHALL
NOT be taken from whichever month the visitor happens to be viewing. A link built
from the viewer's current month would resolve to the wrong month for an event
near a month boundary, which is precisely when the visitor is least likely to
notice.

The month parameter is required because the calendar fetches events one displayed
month at a time. An `#event-<id>` alone SHALL NOT be assumed resolvable: an event
outside the loaded month is not in memory, and the public API exposes no
single-event lookup to fall back on.

On load, a calendar URL carrying an event fragment SHALL load the month named by
the month parameter — via the existing month-loading behavior, which already
de-duplicates by `id` and skips months already loaded — and SHALL then open that
event's modal. The month SHALL be loaded before the modal is opened, since the
event is not in memory until it is.

The month parameter SHALL be treated as an untrusted hint, not as input to be
relied on. A parameter that is absent, does not match a four-digit year and
two-digit month, or names a month outside a sane calendar range SHALL fall back
to the current month, and the calendar SHALL remain usable. An event id that is
not present after the month loads SHALL open nothing, leaving the calendar on
that month rather than erroring or blanking.

The event id SHALL be URL-encoded when written into the fragment and decoded when
read back, and SHALL be encoded for its output context wherever it reaches the
DOM, per the `content-rendering` capability. An id arriving from the API is an
untrusted value on this path like any other.

Closing the modal SHALL remove both the event fragment and the month parameter
from the URL, so the address reflects that nothing is open.

A change to the URL fragment while the page is already open SHALL open the
corresponding event, so a link edited or pasted in place behaves like one
followed from elsewhere.

#### Scenario: An open event modal produces a copyable direct link

- **WHEN** a visitor opens an event's modal
- **THEN** the page URL SHALL carry that event's month and an `#event-<id>`
  fragment, and the modal SHALL present a control that copies a link to that event

#### Scenario: The copy control yields a shareable link

- **WHEN** a visitor uses the copy control on an event modal
- **THEN** the copied value SHALL be that event's share page URL, and SHALL NOT be
  the calendar URL carrying the `#event-<id>` fragment

#### Scenario: A shared link opens an event in a month not currently displayed

- **GIVEN** an event whose start time falls in a month other than the current one
- **WHEN** a visitor opens that event's direct link
- **THEN** the calendar SHALL load that event's month and SHALL open that event's
  modal

#### Scenario: The month comes from the event, not from the viewer

- **GIVEN** an event whose start time falls on the first day of a month in the
  event's own timezone
- **WHEN** its direct link is built while the calendar displays the previous month
- **THEN** the link's month parameter SHALL name the event's month

#### Scenario: A malformed month parameter falls back rather than breaking

- **WHEN** a calendar URL carries a month parameter that is missing, not of the
  form `YYYY-MM`, or outside a sane calendar range
- **THEN** the calendar SHALL display the current month and SHALL remain usable

#### Scenario: An unknown event id opens nothing

- **WHEN** a direct link names an id that is not among the events loaded for its
  month
- **THEN** no modal SHALL open and the calendar SHALL remain usable on that month

#### Scenario: Closing the modal clears the link state

- **WHEN** a visitor closes an event modal that was opened from a direct link
- **THEN** the URL SHALL no longer carry the event fragment or the month parameter

#### Scenario: Editing the fragment in place opens the event

- **WHEN** the URL fragment changes to another loaded event's `#event-<id>` while
  the calendar is open
- **THEN** that event's modal SHALL open
