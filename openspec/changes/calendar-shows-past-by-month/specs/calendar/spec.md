# calendar Specification

## ADDED Requirements

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
