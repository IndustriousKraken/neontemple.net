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

