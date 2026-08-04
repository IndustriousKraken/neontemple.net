/**
 * Regression tests for the Alpine calendar component.
 *
 * calendar.js is a browser script that registers its component via
 * `Alpine.data('calendar', factory)` inside an `alpine:init` listener. We load
 * it in a vm sandbox with minimal `document`/`Alpine`/`window` stubs, capture
 * the factory, and exercise the component directly under Node's test runner —
 * no browser, no Alpine, no extra dependencies.
 *
 * The component's methods close over the sandbox's global scope (that is where
 * they are defined), so anything they read as a free variable — `CoterieAPI`,
 * `window` — must be injected onto the sandbox, not Node's `global`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalendar() {
  let initCallback = null;
  let factory = null;
  const hashListeners = [];
  const opened = [];

  const sandbox = {
    document: {
      addEventListener(event, cb) {
        if (event === 'alpine:init') initCallback = cb;
      },
    },
    Alpine: {
      data(name, fn) {
        if (name === 'calendar') factory = fn;
      },
    },
    // Desktop width so the default view is 'grid'. contentStore is the map
    // loadMonth writes fetched events into and openEventFromHash reads back;
    // addEventListener catches init()'s hashchange registration.
    window: {
      innerWidth: 1024,
      contentStore: { events: {}, announcements: {} },
      addEventListener(event, cb) {
        if (event === 'hashchange') hashListeners.push(cb);
      },
    },
    // The deep-link path reads the fragment and the `m` query parameter.
    location: { hash: '', search: '' },
    URLSearchParams,
    // main.js global that openEventModal delegates to; record what it opened.
    showEventModal(id) {
      opened.push(id);
    },
    console,
  };

  const code = fs.readFileSync(path.join(__dirname, 'calendar.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'calendar.js' });

  assert.ok(typeof initCallback === 'function', 'alpine:init listener registered');
  initCallback();
  assert.ok(typeof factory === 'function', 'calendar component factory registered');
  return { factory, sandbox, hashListeners, opened };
}

const VALID_EVENTS = [
  { id: 1, title: 'Lockpick Village', start_time: '2026-06-10T18:00:00Z' },
  { id: 2, title: 'CTF Night', start_time: '2026-06-20T19:30:00Z' },
];
const INVALID_EVENT = { id: 3, title: 'Broken Record', start_time: 'not-a-date' };
const MISSING_TIME_EVENT = { id: 4, title: 'No Time', start_time: undefined };

function makeComponent() {
  const { factory, sandbox, hashListeners, opened } = loadCalendar();
  const component = factory();
  // June 2026 so the valid events fall inside the rendered month.
  component.currentDate = new Date(2026, 5, 15);
  return { component, sandbox, hashListeners, opened };
}

function collectGridEventIds(days) {
  const ids = [];
  for (const day of days) {
    for (const event of day.events) ids.push(event.id);
  }
  return ids;
}

test('calendar_renders_when_an_event_has_invalid_start_time', () => {
  const { component } = makeComponent();
  // Mixed set: valid events plus one whose start_time is "not-a-date".
  // Simulate the raw API payload reaching the getter unfiltered.
  component.events = [...VALID_EVENTS, INVALID_EVENT];

  let days;
  assert.doesNotThrow(() => {
    days = component.calendarDays;
  }, 'reading calendarDays must not throw on an invalid start_time');

  const gridIds = collectGridEventIds(days);
  assert.ok(gridIds.includes(1), 'valid event 1 appears in its day cell');
  assert.ok(gridIds.includes(2), 'valid event 2 appears in its day cell');
  assert.ok(!gridIds.includes(3), 'invalid event is omitted from the grid');
});

test('calendar tolerates an event with a missing start_time', () => {
  const { component } = makeComponent();
  component.events = [...VALID_EVENTS, MISSING_TIME_EVENT];

  let days;
  assert.doesNotThrow(() => {
    days = component.calendarDays;
  });

  const gridIds = collectGridEventIds(days);
  assert.deepEqual(gridIds.sort(), [1, 2], 'only valid events render; missing-time event omitted');
});

test('selectedDateEvents tolerates an invalid start_time', () => {
  const { component } = makeComponent();
  component.events = [...VALID_EVENTS, INVALID_EVENT];
  component.selectedDate = new Date(2026, 5, 10); // matches valid event 1

  let selected;
  assert.doesNotThrow(() => {
    selected = component.selectedDateEvents;
  });
  assert.deepEqual(selected.map(e => e.id), [1], 'only the matching valid event is listed');
});

test('formatDateKey returns null for an invalid date', () => {
  const { component } = makeComponent();
  assert.equal(component.formatDateKey(new Date('not-a-date')), null);
  assert.equal(component.formatDateKey(new Date('2026-06-10T18:00:00Z')), '2026-06-10');
});

test('eventDayKey buckets evening events on their Eastern calendar day across DST', () => {
  const { sandbox } = loadCalendar();
  // Thu 7pm EST → 2025-11-21T00:00Z, which is *Friday* in UTC. The old code
  // bucketed by the UTC date (toISOString) and put it on Friday; it must bucket
  // on Thu Nov 20. This is the reported "November/December show on Friday" bug.
  assert.equal(
    sandbox.eventDayKey({ start_time: '2025-11-21T00:00:00Z', timezone: 'America/New_York' }),
    '2025-11-20',
  );
  // Thu 7pm EDT → 2025-08-21T23:00Z, still Thursday in UTC — summer months were
  // already correct and must stay on Thursday.
  assert.equal(
    sandbox.eventDayKey({ start_time: '2025-08-21T23:00:00Z', timezone: 'America/New_York' }),
    '2025-08-21',
  );
  // Invalid start_time → null, matching formatDateKey's guard so a bad record
  // cannot abort the render pass.
  assert.equal(
    sandbox.eventDayKey({ start_time: 'not-a-date', timezone: 'America/New_York' }),
    null,
  );
});

test('loadEvents filters out events with an unparseable start_time', async () => {
  const { component, sandbox } = makeComponent();
  // Inject the API stub onto the sandbox the component closes over.
  sandbox.CoterieAPI = {
    async getEvents() {
      return [...VALID_EVENTS, INVALID_EVENT, MISSING_TIME_EVENT];
    },
  };

  await component.loadEvents();

  const ids = component.events.map(e => e.id).sort();
  assert.deepEqual(ids, [1, 2], 'invalid records dropped before reaching this.events');
  assert.equal(component.error, null, 'no error surfaced for a tolerated bad record');
});

test('loadEvents_sets_error_state_when_getEvents_rejects', async () => {
  const { component, sandbox } = makeComponent();
  // Inject a failing API stub onto the sandbox the component closes over.
  // A rejecting getEvents simulates the backend being unreachable.
  sandbox.CoterieAPI = {
    async getEvents() {
      throw new Error('down');
    },
  };

  // The failure must be caught inside loadEvents: the call resolves rather
  // than rejecting, so a regression that let the rejection escape is caught.
  await assert.doesNotReject(() => component.loadEvents());

  assert.equal(component.error, 'Could not load events', 'error state surfaced for a failed load');
  assert.equal(component.loading, false, 'loading flag cleared by the finally branch');
});

// --- loadMonth: per-displayed-month fetch, merge, dedup, and error handling ---

test('navigating to an unloaded month fetches its range and merges into the grid', async () => {
  const { component, sandbox } = makeComponent();
  const calls = [];
  sandbox.CoterieAPI = {
    async getEvents(params) {
      calls.push(params);
      // A past-month event the old flat upcoming fetch would never have returned.
      // timezone pins eventDayKey to UTC (matching the grid's UTC day keys) so the
      // grid-placement assertion below doesn't depend on the runtime zone.
      return [{ id: 5, title: 'Past Meetup', start_time: '2026-05-12T18:00:00Z', timezone: 'UTC' }];
    },
  };

  // makeComponent sits on June 2026; page back to the (unloaded) May.
  await component.prevMonth();

  assert.equal(calls.length, 1, 'exactly one ranged fetch for the newly visited month');
  assert.ok(calls[0].from && calls[0].to, 'the fetch carries from and to range params');
  const gridIds = collectGridEventIds(component.calendarDays);
  assert.ok(gridIds.includes(5), 'the past event appears on its day in May');
});

test('an already-loaded month is not refetched', async () => {
  const { component, sandbox } = makeComponent();
  let fetches = 0;
  sandbox.CoterieAPI = {
    async getEvents() {
      fetches++;
      return [];
    },
  };

  await component.loadMonth(2026, 5); // June
  assert.equal(fetches, 1, 'first visit fetches');
  await component.loadMonth(2026, 5); // June again
  assert.equal(fetches, 1, 'returning to a loaded month issues no further fetch');
});

test('concurrent navigation to the same unloaded month fetches only once', async () => {
  const { component, sandbox } = makeComponent();
  let fetches = 0;
  sandbox.CoterieAPI = {
    async getEvents() {
      fetches++;
      return [];
    },
  };

  // Two navigations to the same unloaded month race the guard before either
  // resolves. The month is claimed synchronously (before the fetch awaits), so
  // the second call is skipped rather than firing a duplicate request.
  await Promise.all([component.loadMonth(2026, 7), component.loadMonth(2026, 7)]);

  assert.equal(fetches, 1, 'the second concurrent call is skipped by the up-front claim');
});

test('an event spanning two overlapping month loads is de-duplicated by id', async () => {
  const { component, sandbox } = makeComponent();
  // A boundary event returned by both the May (padded) and the June range.
  const shared = { id: 7, title: 'Boundary', start_time: '2026-06-01T12:00:00Z' };
  sandbox.CoterieAPI = {
    async getEvents() {
      return [shared];
    },
  };

  await component.loadMonth(2026, 4); // May — padded range reaches into June 1
  await component.loadMonth(2026, 5); // June — also returns the shared event

  const matches = component.events.filter(e => e.id === 7);
  assert.equal(matches.length, 1, 'the shared event appears exactly once');
});

test('loadMonth_sets_error_state_when_getEvents_rejects', async () => {
  const { component, sandbox } = makeComponent();
  // A rejecting getEvents simulates the backend being unreachable.
  sandbox.CoterieAPI = {
    async getEvents() {
      throw new Error('down');
    },
  };

  await assert.doesNotReject(() => component.loadMonth(2026, 5));

  assert.equal(component.error, 'Could not load events', 'error state surfaced for a failed load');
  assert.equal(component.loading, false, 'loading flag cleared by the finally branch');
});

// --- searchFilteredEvents: the calendar's case-insensitive, multi-field filter ---

test('searchFilteredEvents_returns_all_events_for_empty_or_whitespace_search', () => {
  const { component } = makeComponent();
  component.events = [...VALID_EVENTS];

  // An empty term imposes no filter: every event is returned.
  component.search = '';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id).sort(),
    [1, 2],
    'empty search term returns all events',
  );

  // A whitespace-only term trims to empty, so it must behave the same way.
  component.search = '   ';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id).sort(),
    [1, 2],
    'whitespace-only search term returns all events',
  );
});

test('searchFilteredEvents_matches_title_case_insensitively', () => {
  const { component } = makeComponent();
  component.events = [...VALID_EVENTS]; // event 2 is titled 'CTF Night'

  // A lower-case term must match the mixed-case title.
  component.search = 'ctf';
  const ids = component.searchFilteredEvents.map(e => e.id);
  assert.deepEqual(ids, [2], 'lower-case term matches mixed-case title only');
});

test('searchFilteredEvents_matches_description_location_and_type', () => {
  const { component } = makeComponent();
  // Each event carries a distinct, identifying value in a different field so a
  // match can only come from that field. Titles share no terms with the probes.
  component.events = [
    { id: 10, title: 'Alpha', start_time: '2026-06-10T18:00:00Z', description: 'Soldering workshop' },
    { id: 11, title: 'Bravo', start_time: '2026-06-11T18:00:00Z', location: 'The Vault' },
    { id: 12, title: 'Charlie', start_time: '2026-06-12T18:00:00Z', event_type: 'Workshop' },
  ];

  // description match, term in a different case than the stored value.
  component.search = 'SOLDERING';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id),
    [10],
    'matches on description, case-insensitively',
  );

  // location match.
  component.search = 'vault';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id),
    [11],
    'matches on location, case-insensitively',
  );

  // event_type match.
  component.search = 'workshop';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id).sort(),
    [10, 12],
    'matches on event_type (12) and on the description containing "workshop" (10)',
  );
});

test('searchFilteredEvents_returns_empty_for_no_match', () => {
  const { component } = makeComponent();
  component.events = [
    { id: 10, title: 'Alpha', start_time: '2026-06-10T18:00:00Z', description: 'Soldering workshop', location: 'The Vault', event_type: 'Workshop' },
    { id: 11, title: 'Bravo', start_time: '2026-06-11T18:00:00Z' },
  ];

  // A term that appears in none of the searchable fields filters everything out.
  component.search = 'zzzznotpresent';
  assert.deepEqual(
    component.searchFilteredEvents,
    [],
    'a term matching no searchable field returns an empty list',
  );
});

test('searchFilteredEvents_tolerates_events_missing_optional_fields', () => {
  const { component } = makeComponent();
  // An event with only a title — the optional description/location/event_type
  // fields are absent, so the getter's null-guards must keep it from throwing.
  const TITLE_ONLY = { id: 20, title: 'Keysigning', start_time: '2026-06-15T18:00:00Z' };
  component.events = [TITLE_ONLY];

  // A non-empty, non-matching term must complete without throwing and exclude
  // the event (the missing fields cannot match).
  let result;
  assert.doesNotThrow(() => {
    component.search = 'nomatch';
    result = component.searchFilteredEvents;
  }, 'filtering an event missing optional fields must not throw');
  assert.deepEqual(result, [], 'title-only event is excluded when the term does not match its title');

  // The same event is included when the term matches its title.
  component.search = 'keysigning';
  assert.deepEqual(
    component.searchFilteredEvents.map(e => e.id),
    [20],
    'title-only event is included when the term matches its title',
  );
});

// --- event deep links: /calendar/?m=<YYYY-MM>#event-<id> --------------------

const SEPT_EVENT = {
  id: 'e-9',
  title: 'Fall Workshop',
  start_time: '2026-09-12T18:00:00Z',
  timezone: 'UTC',
};

// Point the sandbox's location at a deep link. `search` is left empty when the
// month hint is omitted, which is one of the malformed cases.
function setDeepLink(sandbox, id, month) {
  sandbox.location.hash = '#event-' + encodeURIComponent(id);
  sandbox.location.search = month == null ? '' : `?m=${month}`;
}

test('parseMonthParam accepts YYYY-MM and discards everything else', () => {
  const { parseMonthParam } = loadCalendar().sandbox;
  // Spread into this realm: the vm context has its own Object.prototype, which
  // deepStrictEqual compares.
  const parsed = (v) => ({ ...parseMonthParam(v) });

  assert.deepEqual(parsed('2026-09'), { year: 2026, month: 8 }, 'month is 0-indexed for Date');
  assert.deepEqual(parsed('2026-01'), { year: 2026, month: 0 });
  assert.deepEqual(parsed('2026-12'), { year: 2026, month: 11 });

  // Absent, wrong shape, out-of-range month, and years outside a sane window.
  // Each must yield null rather than reaching `new Date`, which would accept
  // several of these and silently resolve them to something else.
  for (const bad of [
    undefined, null, '', '2026-13', '2026-00', 'garbage', '2026-1', '26-01',
    '2026-09-01', ' 2026-09', '0001-05', '9999-05', '20260-9',
  ]) {
    assert.equal(parseMonthParam(bad), null, `${JSON.stringify(bad)} is discarded`);
  }
});

test('a deep link loads its own month before opening the modal', async () => {
  const { component, sandbox, opened } = makeComponent(); // displays June 2026
  const order = [];
  sandbox.CoterieAPI = {
    async getEvents() {
      order.push('fetch');
      return [SEPT_EVENT];
    },
  };
  sandbox.showEventModal = (id) => {
    order.push('open');
    opened.push(id);
  };
  setDeepLink(sandbox, SEPT_EVENT.id, '2026-09');

  await component.init();

  // Ordering, not just the end state: an implementation that opened first and
  // loaded second would still end up with the modal open once the month is
  // cached, so the sequence is what the assertion has to pin down.
  assert.deepEqual(order, ['fetch', 'open'], 'the linked month is fetched before the modal opens');
  assert.deepEqual(opened, [SEPT_EVENT.id], 'the linked event opened');
  assert.equal(component.currentYear, 2026);
  assert.equal(component.currentMonth, 8, 'the calendar moved to the linked month');
});

test('an unknown event id opens nothing and leaves the calendar rendered', async () => {
  const { component, sandbox, opened } = makeComponent();
  sandbox.CoterieAPI = {
    async getEvents() {
      return [SEPT_EVENT];
    },
  };
  setDeepLink(sandbox, 'not-a-real-id', '2026-09');

  await component.init();

  assert.deepEqual(opened, [], 'no modal opened for an id absent from the month');
  assert.equal(component.currentMonth, 8, 'the visitor is left on the linked month');
  assert.equal(component.error, null, 'a missing id is not an error');
  assert.ok(
    collectGridEventIds(component.calendarDays).includes(SEPT_EVENT.id),
    'the month that did load is still rendered',
  );
});

test('a malformed month hint falls back to the current month without throwing', async () => {
  for (const bad of [null, '2026-13', 'garbage', '2026-1', '0001-05']) {
    const { component, sandbox, opened } = makeComponent(); // displays June 2026
    sandbox.CoterieAPI = {
      async getEvents() {
        return [SEPT_EVENT];
      },
    };
    setDeepLink(sandbox, SEPT_EVENT.id, bad);

    await assert.doesNotReject(() => component.init(), `m=${bad} must not throw`);

    assert.equal(component.currentYear, 2026, `m=${bad} keeps the current year`);
    assert.equal(component.currentMonth, 5, `m=${bad} falls back to the displayed month`);
    assert.equal(component.error, null, `m=${bad} leaves the calendar usable`);
    assert.equal(component.calendarDays.length, 30 + component.firstDayOfMonth, 'June still renders');
    // The event is in the store (the June range returned it) so the fragment
    // still resolves — the fallback is about the month, not about failing.
    assert.deepEqual(opened, [SEPT_EVENT.id]);
  }
});

test('a hashchange while the calendar is open opens that event', async () => {
  const { component, sandbox, hashListeners, opened } = makeComponent();
  sandbox.CoterieAPI = {
    async getEvents() {
      return [SEPT_EVENT];
    },
  };

  await component.init(); // no fragment yet: plain load of the current month
  assert.deepEqual(opened, [], 'nothing opened without a fragment');
  assert.equal(hashListeners.length, 1, 'init registered a hashchange listener');

  setDeepLink(sandbox, SEPT_EVENT.id, '2026-09');
  await hashListeners[0]();

  assert.deepEqual(opened, [SEPT_EVENT.id], 'the pasted fragment opened its event');
  assert.equal(component.currentMonth, 8, 'and navigated to its month');
});

test('an id with URL-significant characters survives the fragment round trip', async () => {
  const ODD_ID = 'a b/c?d#e&f';
  const { component, sandbox, opened } = makeComponent();
  sandbox.CoterieAPI = {
    async getEvents() {
      return [{ ...SEPT_EVENT, id: ODD_ID }];
    },
  };
  setDeepLink(sandbox, ODD_ID, '2026-09');

  // The `?` and `#` in the id must not be read as a query/fragment boundary,
  // which is what encodeURIComponent on write and decodeURIComponent on read buy.
  assert.ok(!sandbox.location.hash.includes('?'), 'the id is written encoded');
  await component.init();

  assert.deepEqual(opened, [ODD_ID], 'the decoded id matched the stored event');
});
