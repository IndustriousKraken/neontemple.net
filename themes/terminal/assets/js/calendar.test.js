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
    // Desktop width so the default view is 'grid'; loadEvents guards
    // window.contentStore, so leaving it undefined is fine.
    window: { innerWidth: 1024 },
    console,
  };

  const code = fs.readFileSync(path.join(__dirname, 'calendar.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'calendar.js' });

  assert.ok(typeof initCallback === 'function', 'alpine:init listener registered');
  initCallback();
  assert.ok(typeof factory === 'function', 'calendar component factory registered');
  return { factory, sandbox };
}

const VALID_EVENTS = [
  { id: 1, title: 'Lockpick Village', start_time: '2026-06-10T18:00:00Z' },
  { id: 2, title: 'CTF Night', start_time: '2026-06-20T19:30:00Z' },
];
const INVALID_EVENT = { id: 3, title: 'Broken Record', start_time: 'not-a-date' };
const MISSING_TIME_EVENT = { id: 4, title: 'No Time', start_time: undefined };

function makeComponent() {
  const { factory, sandbox } = loadCalendar();
  const component = factory();
  // June 2026 so the valid events fall inside the rendered month.
  component.currentDate = new Date(2026, 5, 15);
  return { component, sandbox };
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
