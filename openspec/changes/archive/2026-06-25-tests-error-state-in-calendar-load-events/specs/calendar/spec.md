## ADDED Requirements

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
