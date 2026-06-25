## 1. Add an error-path test for the calendar loadEvents method

- [ ] 1.1 In `themes/terminal/assets/js/calendar.test.js`, add
  `loadEvents_sets_error_state_when_getEvents_rejects` — build the component via
  the existing `makeComponent()` helper, inject a `CoterieAPI` stub onto the
  sandbox whose `getEvents` rejects (e.g. `async getEvents() { throw new Error('down'); }`),
  `await component.loadEvents()`, and assert:
  - the call does not throw (`await assert.doesNotReject(...)` or an
    `await component.loadEvents()` that completes),
  - `component.error === 'Could not load events'`,
  - `component.loading === false`.
