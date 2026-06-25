## Why

The Alpine calendar component's `loadEvents` method
(`themes/terminal/assets/js/calendar.js:110-132`) wraps its API call in a
`try/catch/finally`. The **catch branch** sets `this.error = 'Could not load
events'` and logs, and the **finally** clears `this.loading = false`
(`calendar.js:126-131`). This error state is what the calendar view renders when
the backend is unreachable.

`calendar.test.js` covers only the success path — `loadEvents filters out events
with an unparseable start_time` injects a `CoterieAPI.getEvents` stub that
*resolves*. No test injects a *rejecting* `getEvents`, so the failure branch (the
error message, the cleared loading flag, and the guarantee that no exception
escapes `loadEvents`) is unverified. A regression that let the rejection escape,
or left `loading` stuck at `true`, would not be caught.

The existing `calendar` capability specifies only that the calendar tolerates
events with an invalid start time; it says nothing about what happens when the
event load itself fails. This change adds that invariant and the test that asserts
it.

## What Changes

- Add one error-path test in `themes/terminal/assets/js/calendar.test.js` that
  injects a `CoterieAPI.getEvents` stub which rejects, awaits `loadEvents()`, and
  asserts the component's `error` is set to `Could not load events`, its
  `loading` flag is `false`, and no exception escaped.
- Add a `calendar` capability requirement stating that a failed event load sets
  the error state and clears loading without crashing.

## Impact

- Test file: `themes/terminal/assets/js/calendar.test.js` (new test; no
  production code change).
- Capability spec: `calendar` (one ADDED requirement).
