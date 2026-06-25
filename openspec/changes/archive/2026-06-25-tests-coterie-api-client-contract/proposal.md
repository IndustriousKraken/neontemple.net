## Why

`themes/terminal/assets/js/api.js` defines the `CoterieAPI` client that every
page uses to reach the Coterie backend, yet it has **no test file at all** (there
is no `api.test.js` alongside `calendar.test.js` and `main.test.js`). Two
behaviors are wholly uncovered:

- **Error paths in the `fetch` wrapper (`api.js:12-34`).** The wrapper has three
  failure branches, none exercised:
  - a non-OK response whose JSON body carries a `message` →
    `throw new Error(error.message)` (`api.js:26`);
  - a non-OK response whose body does **not** parse — the
    `.catch(() => ({}))` fallback (`api.js:25`) — →
    `throw new Error(`HTTP ${response.status}`)` (`api.js:26`); and
  - a rejection of the underlying `fetch` (network failure), which is logged and
    re-thrown (`api.js:30-32`).
  These are the only signals callers such as `loadEvents` (`calendar.js`) and the
  homepage loaders (`main.js`) use to decide whether to show an error state, so
  the exact rejection contract matters.
- **Query-string construction in `getEvents` / `getAnnouncements`
  (`api.js:43-66`).** The `if (limit)` / `if (type)` branches decide which
  parameters are appended. Notably `limit: 0` is falsy and is therefore omitted —
  an off-by-one-style boundary that no test pins.

No canonical spec governs the API client today, so this change establishes that
contract (a new `api-client` capability) and lands the tests that assert it.

## What Changes

- Add `themes/terminal/assets/js/api.test.js` (a `vm`-sandbox harness mirroring
  `calendar.test.js` / `main.test.js`) and:
  - error-path tests for the `fetch` wrapper: backend `message` surfaced, the
    `HTTP <status>` fallback on an unparseable body, network rejection
    propagation, and the OK path returning the parsed JSON body; and
  - query-construction tests for `getEvents` / `getAnnouncements`: combined
    `limit`+`type`, bare endpoint with no params, and the `limit: 0` omission.
- Establish an `api-client` capability requirement: the client surfaces backend
  errors from non-OK responses, and builds list endpoints from optional query
  parameters.

## Impact

- New test file: `themes/terminal/assets/js/api.test.js` (no production code
  changes — this is a pure coverage addition).
- New capability spec: `api-client`.
