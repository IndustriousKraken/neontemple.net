## 1. Add error-path tests for the API client fetch wrapper

- [ ] 1.1 Create `themes/terminal/assets/js/api.test.js` that loads `api.js` in a
  `vm` sandbox (as in `calendar.test.js` / `main.test.js`), injecting `window`,
  `console`, a stubbable global `fetch`, and `URLSearchParams` (both are browser
  globals the sandbox must provide), and reads the client from
  `sandbox.window.CoterieAPI`.
- [ ] 1.2 `fetch_rejects_with_backend_message_on_non_ok_response` — stub `fetch`
  to resolve `{ ok: false, status: 500, json: async () => ({ message: 'boom' }) }`
  and assert `CoterieAPI.fetch('/x')` rejects with an `Error` whose `message` is
  `'boom'`.
- [ ] 1.3 `fetch_falls_back_to_http_status_when_body_unparseable` — stub `fetch`
  to resolve `{ ok: false, status: 503, json: async () => { throw new SyntaxError() } }`
  and assert the rejection is an `Error` whose `message` is `'HTTP 503'`.
- [ ] 1.4 `fetch_propagates_network_failure` — stub `fetch` to reject with
  `new TypeError('network down')` and assert `CoterieAPI.fetch('/x')` rejects with
  that same error.
- [ ] 1.5 `fetch_returns_parsed_json_on_ok_response` — stub `fetch` to resolve
  `{ ok: true, status: 200, json: async () => [{ id: 1 }] }` and assert the
  resolved value deep-equals `[{ id: 1 }]`.

## 2. Add query-construction tests for getEvents/getAnnouncements

- [ ] 2.1 `get_events_combines_limit_and_type_params` — stub `fetch` to capture
  the requested endpoint and assert `getEvents({ limit: 25, type: 'ctf' })`
  requests `/public/events?limit=25&type=ctf`.
- [ ] 2.2 `get_events_requests_bare_endpoint_without_params` — assert
  `getEvents()` requests `/public/events` with no query string.
- [ ] 2.3 `get_events_omits_zero_limit` — assert `getEvents({ limit: 0 })`
  requests `/public/events` (the falsy `0` is not appended as a `limit`).
- [ ] 2.4 `get_announcements_appends_only_supplied_params` — assert
  `getAnnouncements({ type: 'news' })` requests `/public/announcements?type=news`
  and `getAnnouncements()` requests `/public/announcements`.
