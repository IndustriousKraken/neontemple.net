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

