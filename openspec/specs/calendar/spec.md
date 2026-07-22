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

