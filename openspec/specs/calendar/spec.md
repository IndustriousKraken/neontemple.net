# calendar Specification

## Purpose
TBD - created by archiving change fix-calendar-crash-on-invalid-event-time. Update Purpose after archive.
## Requirements
### Requirement: The calendar tolerates events with an invalid start time

An event whose `start_time` is missing or does not parse to a valid date SHALL be
skipped when the calendar view builds its day cells, and SHALL NOT prevent the
calendar grid or the remaining events from rendering.

#### Scenario: one event with an invalid start_time does not blank the calendar

- **GIVEN** the event list contains a mix of events with valid `start_time`
  values and one event whose `start_time` is `"not-a-date"`
- **WHEN** the calendar grid is rendered
- **THEN** rendering completes without throwing
- **AND** the events with valid `start_time` values appear in their day cells
- **AND** the event with the invalid `start_time` is omitted from the grid

### Requirement: The calendar surfaces a load error when events cannot be fetched

On a failed event load, the calendar component SHALL set its `error` state to a
user-facing message, SHALL clear its `loading` flag, and SHALL NOT let the failure
escape `loadEvents` as an unhandled exception.

#### Scenario: a failed events fetch sets the error state and clears loading

- **GIVEN** a calendar component whose events have not yet loaded
- **WHEN** `loadEvents()` runs and the API's `getEvents` rejects
- **THEN** `loadEvents()` resolves without throwing
- **AND** the component's `error` is set to `Could not load events`
- **AND** the component's `loading` flag is `false`

### Requirement: The calendar filters events by a case-insensitive search term

When a search term is present, the calendar's filtered event list SHALL include
only events whose `title`, `description`, `location`, or `event_type` contains the
term, compared case-insensitively. A search term that is empty or contains only
whitespace SHALL impose no filter (all events are included). Events that lack the
optional `description`, `location`, or `event_type` fields SHALL be tolerated
during the match rather than causing an error.

#### Scenario: an empty or whitespace search term returns all events

- **GIVEN** an event list with two or more events
- **WHEN** the search term is empty or contains only whitespace
- **THEN** the filtered list contains every event

#### Scenario: the search term matches across title, description, location, and type

- **GIVEN** events that differ in `title`, `description`, `location`, and
  `event_type`
- **WHEN** the search term, in any letter case, is a substring of one event's
  `title`, `description`, `location`, or `event_type`
- **THEN** the filtered list contains that event
- **AND** the comparison is case-insensitive

#### Scenario: a search term with no match returns no events

- **WHEN** the search term matches none of the events' searchable fields
- **THEN** the filtered list is empty

#### Scenario: events missing optional fields are tolerated during search

- **GIVEN** an event that has a `title` but no `description`, `location`, or
  `event_type`
- **WHEN** a non-empty search term is applied
- **THEN** filtering completes without throwing
- **AND** the event is included only when the term matches its `title`

### Requirement: The calendar loads the displayed month's events, including past ones

The calendar SHALL fetch events for the month it is displaying, using the public
API's date-range parameters (`from`/`to`) covering that month, so past events
appear on their days rather than being hidden. When the displayed month changes
— previous, next, today, or jump-to-event — the calendar SHALL load that month's
events if they are not already loaded and merge them, de-duplicated by `id`, with
events already in memory. A month whose events are already loaded SHALL NOT be
refetched. A failed fetch SHALL leave the error state set and loading cleared, as
for any events fetch.

#### Scenario: Navigating to a past month loads that month's events

- **WHEN** the visitor pages back to a month whose events have not yet been loaded
- **THEN** the calendar SHALL request that month's range from the API and past
  events in that month SHALL appear on their days

#### Scenario: An already-loaded month is not refetched

- **WHEN** the visitor returns to a month whose events are already in memory
- **THEN** the calendar SHALL NOT issue another fetch for that month

#### Scenario: Merged events are de-duplicated by id

- **WHEN** a month is loaded whose range overlaps events already held (for example
  a padded boundary day)
- **THEN** each event SHALL appear once in the calendar's in-memory list, keyed by
  its `id`

### Requirement: A calendar event has a shareable direct link

An open event modal SHALL reflect the event in the page URL as a calendar URL
carrying a month parameter and an `#event-<id>` fragment, and SHALL offer a copy
control that puts that URL on the clipboard. The event modal SHALL match the
announcement modal's existing affordance rather than inventing a second shape for
the same idea.

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
  fragment, and the modal SHALL present a control that copies that URL

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

