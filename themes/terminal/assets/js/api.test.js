/**
 * Contract tests for the Coterie API client (api.js).
 *
 * api.js is a browser script: it defines the `CoterieAPI` object and publishes
 * it as `window.CoterieAPI`. As in calendar.test.js / main.test.js we load it in
 * a vm sandbox with minimal browser-global stubs — no browser, no extra
 * dependencies — and exercise the client directly under Node's test runner.
 *
 * Two behaviors are pinned here:
 *
 *   - The `fetch` wrapper's rejection contract (api.js:12-34). A non-OK response
 *     surfaces the backend `message`; a non-OK response whose body will not parse
 *     falls back to `HTTP <status>`; a rejection of the underlying `fetch`
 *     (network failure) propagates unchanged; and an OK response resolves to the
 *     parsed JSON body. These are the only signals callers (loadEvents in
 *     calendar.js, the homepage loaders in main.js) use to decide whether to show
 *     an error state.
 *
 *   - Query-string construction in getEvents / getAnnouncements (api.js:43-66).
 *     `limit` and `type` are appended only when truthy, so `limit: 0` is omitted —
 *     a boundary the `if (limit)` guard makes easy to get wrong.
 *
 * Realm note: vm.createContext gives the sandbox its own set of intrinsics, so an
 * Error constructed *inside* api.js is not `instanceof` this file's `Error`. For
 * the wrapper-thrown errors we assert against the sandbox's own `Error`
 * constructor (exposed by loadAPI); the network-failure case re-throws the very
 * object we passed in, so there we assert identity.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * Load api.js in a fresh vm sandbox.
 *
 * @param {Object}   [opts]
 * @param {Function} [opts.fetchImpl] - Stub for the global `fetch`. Defaults to a
 *   recorder that pushes each requested URL onto `calls` and resolves an empty OK
 *   JSON body — enough for the query-construction tests to read `calls`.
 * @param {string}   [opts.apiUrl]    - Value for `window.COTERIE_API_URL`. Left
 *   undefined by default so `baseURL` is '' and request URLs are bare endpoints.
 * @returns {{ CoterieAPI: Object, calls: string[], SandboxError: Function }}
 */
function loadAPI({ fetchImpl, apiUrl } = {}) {
  const calls = [];

  const sandbox = {
    // baseURL = window.COTERIE_API_URL || '' — undefined yields a '' baseURL.
    window: { COTERIE_API_URL: apiUrl },
    // The wrapper's catch logs via console.error on every failure path; these
    // tests trigger those paths on purpose, so swallow the noise.
    console: { error() {} },
    // Browser global getEvents/getAnnouncements use to build the query string.
    URLSearchParams,
    // Stubbable browser global.
    fetch:
      fetchImpl ||
      (async (url) => {
        calls.push(url);
        return { ok: true, status: 200, json: async () => [] };
      }),
  };

  const code = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'api.js' });

  return {
    CoterieAPI: sandbox.window.CoterieAPI,
    calls,
    // The sandbox realm's Error, for cross-realm-safe instanceof checks.
    SandboxError: vm.runInContext('Error', sandbox),
  };
}

// --- fetch wrapper rejection contract ---------------------------------------

test('fetch_rejects_with_backend_message_on_non_ok_response', async () => {
  const { CoterieAPI, SandboxError } = loadAPI({
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: 'boom' }),
    }),
  });

  await assert.rejects(
    () => CoterieAPI.fetch('/x'),
    (err) => {
      assert.ok(err instanceof SandboxError, 'rejection is an Error');
      assert.equal(err.message, 'boom', 'backend message is surfaced verbatim');
      return true;
    },
  );
});

test('fetch_falls_back_to_http_status_when_body_unparseable', async () => {
  const { CoterieAPI, SandboxError } = loadAPI({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError('unexpected token');
      },
    }),
  });

  await assert.rejects(
    () => CoterieAPI.fetch('/x'),
    (err) => {
      assert.ok(err instanceof SandboxError, 'rejection is an Error');
      assert.equal(err.message, 'HTTP 503', 'falls back to HTTP <status>');
      return true;
    },
  );
});

test('fetch_propagates_network_failure', async () => {
  // Created in this realm and re-thrown unchanged by the wrapper, so the caller
  // sees the very same object.
  const networkErr = new TypeError('network down');
  const { CoterieAPI } = loadAPI({
    fetchImpl: async () => {
      throw networkErr;
    },
  });

  await assert.rejects(
    () => CoterieAPI.fetch('/x'),
    (err) => {
      assert.equal(err, networkErr, 'the original network error propagates unchanged');
      return true;
    },
  );
});

test('fetch_returns_parsed_json_on_ok_response', async () => {
  const { CoterieAPI } = loadAPI({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 1 }],
    }),
  });

  const result = await CoterieAPI.fetch('/x');
  assert.deepEqual(result, [{ id: 1 }], 'resolves to the parsed JSON body');
});

// --- getEvents / getAnnouncements query construction ------------------------

test('get_events_combines_limit_and_type_params', async () => {
  const { CoterieAPI, calls } = loadAPI();
  await CoterieAPI.getEvents({ limit: 25, type: 'ctf' });
  assert.deepEqual(calls, ['/public/events?limit=25&type=ctf']);
});

test('get_events_requests_bare_endpoint_without_params', async () => {
  const { CoterieAPI, calls } = loadAPI();
  await CoterieAPI.getEvents();
  assert.deepEqual(calls, ['/public/events'], 'no params means no query string');
});

test('get_events_omits_zero_limit', async () => {
  const { CoterieAPI, calls } = loadAPI();
  await CoterieAPI.getEvents({ limit: 0 });
  assert.deepEqual(calls, ['/public/events'], 'falsy 0 is not appended as a limit');
});

test('get_announcements_appends_only_supplied_params', async () => {
  const supplied = loadAPI();
  await supplied.CoterieAPI.getAnnouncements({ type: 'news' });
  assert.deepEqual(
    supplied.calls,
    ['/public/announcements?type=news'],
    'only the supplied type is appended',
  );

  const bare = loadAPI();
  await bare.CoterieAPI.getAnnouncements();
  assert.deepEqual(bare.calls, ['/public/announcements'], 'no params means bare endpoint');
});
