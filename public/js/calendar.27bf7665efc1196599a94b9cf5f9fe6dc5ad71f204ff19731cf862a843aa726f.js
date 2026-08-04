/**
 * Alpine.js Calendar Component
 * Grid view with search/filter for events
 */

// YYYY-MM-DD of an event's start instant, evaluated in the event's own IANA
// timezone (from the API). Bucketing by the UTC date (toISOString) instead
// shifts evening events across midnight: a Thu 7pm EST event is 2025-11-21T00:00Z
// — Friday in UTC — and would wrongly land in the Friday cell. Falls back to the
// runtime-local zone when an event carries no timezone.
function eventDayKey(event) {
  const date = new Date(event.start_time);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// The `m=<YYYY-MM>` deep-link parameter as { year, month } (month 0-indexed, as
// Date wants it), or null when it is absent or implausible. It arrives from a
// pasted URL, so it is a hint and not input to be relied on: `new Date` would
// accept far more than YYYY-MM and fail silently on the rest, so the shape is
// matched first and the numbers range-checked before either is used. A null
// result means "use the current month" — never an error.
function parseMonthParam(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return null;
  if (year < 1970 || year > 2999) return null; // sane calendar window
  return { year, month: month - 1 };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('calendar', () => ({
    // State
    events: [],
    loadedMonths: new Set(), // 'YYYY-MM' keys already fetched, so navigation doesn't refetch
    loading: true,
    error: null,
    search: '',
    searchFocused: false,
    currentDate: new Date(),
    selectedDate: null,
    view: window.innerWidth <= 768 ? 'list' : 'grid', // Default to list on mobile

    // Computed
    get currentMonth() {
      return this.currentDate.getMonth();
    },

    get currentYear() {
      return this.currentDate.getFullYear();
    },

    get monthLabel() {
      return this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    },

    get daysInMonth() {
      return new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    },

    get firstDayOfMonth() {
      return new Date(this.currentYear, this.currentMonth, 1).getDay();
    },

    get searchFilteredEvents() {
      if (!this.search.trim()) return this.events;

      const term = this.search.toLowerCase();
      return this.events.filter(e =>
        e.title.toLowerCase().includes(term) ||
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.location && e.location.toLowerCase().includes(term)) ||
        (e.event_type && e.event_type.toLowerCase().includes(term))
      );
    },

    get calendarDays() {
      const days = [];

      // Empty cells for days before the 1st
      for (let i = 0; i < this.firstDayOfMonth; i++) {
        days.push({ number: null, date: null, events: [] });
      }

      // Days of the month (unfiltered - grid shows all events)
      for (let day = 1; day <= this.daysInMonth; day++) {
        const date = new Date(this.currentYear, this.currentMonth, day);
        const dateStr = this.formatDateKey(date);
        const dayEvents = this.events.filter(e => eventDayKey(e) === dateStr);

        days.push({
          number: day,
          date: date,
          dateStr: dateStr,
          events: dayEvents,
          isToday: this.isToday(date),
          isSelected: this.selectedDate && this.formatDateKey(this.selectedDate) === dateStr
        });
      }

      return days;
    },

    // Search results for dropdown in grid view
    get searchResults() {
      if (!this.search.trim() || this.view !== 'grid') return [];

      return [...this.searchFilteredEvents]
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .slice(0, 6); // Limit dropdown to 6 results
    },

    get showSearchDropdown() {
      return this.view === 'grid' && this.search.trim() && this.searchFocused && this.searchResults.length > 0;
    },

    get filteredEvents() {
      // Sort by start_time ascending (soonest events first)
      return [...this.searchFilteredEvents].sort((a, b) =>
        new Date(a.start_time) - new Date(b.start_time)
      );
    },

    get selectedDateEvents() {
      if (!this.selectedDate) return [];
      const dateStr = this.formatDateKey(this.selectedDate);
      // Use unfiltered events since grid view is unfiltered
      return this.events.filter(e => eventDayKey(e) === dateStr);
    },

    // Methods
    async init() {
      // A deep link names its own month, so let it pick the month to fetch
      // rather than loading today's first and paying for a second round trip.
      if (!(await this.openEventFromHash())) {
        await this.loadMonth(this.currentYear, this.currentMonth);
      }
      // Deep-link support: open an event when the URL is edited/pasted while on
      // the page, mirroring main.js's openAnnouncementFromHash registration.
      window.addEventListener('hashchange', () => this.openEventFromHash());
    },

    // Open the event named by an `#event-<id>` fragment, first navigating to the
    // month its `m` parameter names — the event is not in contentStore until
    // that month's fetch resolves, and the public API has no single-event
    // lookup to fall back on. An absent or malformed `m` falls back to the
    // current month; an id still missing after the load opens nothing and
    // leaves the visitor on a working month view. Returns whether the URL
    // carried a fragment at all, which is what tells init() the month is
    // already handled.
    async openEventFromHash() {
      const match = location.hash.match(/^#event-(.+)$/);
      if (!match) return false;

      const id = decodeURIComponent(match[1]);
      const month = parseMonthParam(new URLSearchParams(location.search).get('m'));
      if (month) this.currentDate = new Date(month.year, month.month, 1);
      await this.loadMonth(this.currentYear, this.currentMonth);

      const event = window.contentStore && window.contentStore.events[id];
      if (event) this.openEventModal(event);
      return true;
    },

    // Fetch the given month's events via the API's from/to range and merge them,
    // de-duplicated by id, into this.events. A month already fetched is skipped.
    // The range is padded ~1 day each side so events near a timezone boundary
    // aren't missed; day-bucketing stays on eventDayKey (the event's own zone).
    async loadMonth(year, month) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      if (this.loadedMonths.has(key)) return;
      // Claim the month before awaiting so a second navigation to the same
      // unloaded month can't fire a duplicate fetch; rolled back on failure
      // below so a failed month stays retryable.
      this.loadedMonths.add(key);

      this.loading = true;
      this.error = null;

      const from = new Date(year, month, 1);
      from.setDate(from.getDate() - 1);
      const to = new Date(year, month + 1, 1);
      to.setDate(to.getDate() + 1);

      try {
        const events = await CoterieAPI.getEvents({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        // Merge into a by-id map so overlapping month ranges dedup to one entry.
        const byId = new Map(this.events.map(e => [e.id, e]));
        for (const e of events) {
          // Trust boundary: drop records whose start_time does not parse (as
          // loadEvents does) so a bad record never reaches the grid.
          if (Number.isNaN(new Date(e.start_time).getTime())) continue;
          byId.set(e.id, e);
          if (window.contentStore) window.contentStore.events[e.id] = e;
        }
        this.events = [...byId.values()];
      } catch (err) {
        this.loadedMonths.delete(key); // failed — let a later navigation retry
        this.error = 'Could not load events';
        console.error(err);
      } finally {
        this.loading = false;
      }
    },

    async loadEvents() {
      this.loading = true;
      this.error = null;

      try {
        const events = await CoterieAPI.getEvents({ limit: 100 });
        // The API is a trust boundary: drop any event whose start_time does not
        // parse to a valid date so invalid records never reach the grid or list
        // views (where formatDateKey would otherwise throw on an Invalid Date).
        this.events = events.filter(e => !Number.isNaN(new Date(e.start_time).getTime()));
        // Store events for modal access
        this.events.forEach(e => {
          if (window.contentStore) {
            window.contentStore.events[e.id] = e;
          }
        });
      } catch (err) {
        this.error = 'Could not load events';
        console.error(err);
      } finally {
        this.loading = false;
      }
    },

    getImageUrl(imagePath) {
      if (!imagePath) return '';
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
      }
      const baseUrl = window.COTERIE_API_URL || '';
      return `${baseUrl}/${imagePath}`;
    },

    openEventModal(event) {
      if (typeof showEventModal === 'function') {
        showEventModal(event.id);
      }
    },

    async prevMonth() {
      this.currentDate = new Date(this.currentYear, this.currentMonth - 1, 1);
      this.selectedDate = null;
      await this.loadMonth(this.currentYear, this.currentMonth);
    },

    async nextMonth() {
      this.currentDate = new Date(this.currentYear, this.currentMonth + 1, 1);
      this.selectedDate = null;
      await this.loadMonth(this.currentYear, this.currentMonth);
    },

    async goToToday() {
      this.currentDate = new Date();
      this.selectedDate = new Date();
      await this.loadMonth(this.currentYear, this.currentMonth);
    },

    selectDay(day) {
      if (!day.date) return;
      this.selectedDate = day.date;
    },

    clearSelection() {
      this.selectedDate = null;
    },

    async goToEvent(event) {
      const eventDate = new Date(event.start_time);
      // Navigate to the event's month
      this.currentDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
      // Select the event's day
      this.selectedDate = eventDate;
      // Clear search and close dropdown
      this.search = '';
      this.searchFocused = false;
      await this.loadMonth(this.currentYear, this.currentMonth);
    },

    setView(view) {
      this.view = view;
      if (view === 'list') {
        this.selectedDate = null;
      }
    },

    // Helpers
    formatDateKey(date) {
      // An invalid Date (e.g. from a missing/malformed start_time) makes
      // toISOString() throw RangeError. Return a sentinel instead so a single
      // bad record cannot abort the calendarDays render pass.
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    },

    isToday(date) {
      const today = new Date();
      return date.toDateString() === today.toDateString();
    },

    formatEventTime(isoString, tz) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: tz || undefined
      });
    },

    formatEventDate(isoString, tz) {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz || undefined
      });
    },

    formatFullDate(date) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }));
});
