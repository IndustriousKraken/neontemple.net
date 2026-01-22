/**
 * Alpine.js Calendar Component
 * Grid view with search/filter for events
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('calendar', () => ({
    // State
    events: [],
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
        const dayEvents = this.events.filter(e => this.formatDateKey(new Date(e.start_time)) === dateStr);

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
      return this.events.filter(e => this.formatDateKey(new Date(e.start_time)) === dateStr);
    },

    // Methods
    async init() {
      await this.loadEvents();
    },

    async loadEvents() {
      this.loading = true;
      this.error = null;

      try {
        this.events = await CoterieAPI.getEvents({ limit: 100 });
      } catch (err) {
        this.error = 'Could not load events';
        console.error(err);
      } finally {
        this.loading = false;
      }
    },

    prevMonth() {
      this.currentDate = new Date(this.currentYear, this.currentMonth - 1, 1);
      this.selectedDate = null;
    },

    nextMonth() {
      this.currentDate = new Date(this.currentYear, this.currentMonth + 1, 1);
      this.selectedDate = null;
    },

    goToToday() {
      this.currentDate = new Date();
      this.selectedDate = new Date();
    },

    selectDay(day) {
      if (!day.date) return;
      this.selectedDate = day.date;
    },

    clearSelection() {
      this.selectedDate = null;
    },

    goToEvent(event) {
      const eventDate = new Date(event.start_time);
      // Navigate to the event's month
      this.currentDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
      // Select the event's day
      this.selectedDate = eventDate;
      // Clear search and close dropdown
      this.search = '';
      this.searchFocused = false;
    },

    setView(view) {
      this.view = view;
      if (view === 'list') {
        this.selectedDate = null;
      }
    },

    // Helpers
    formatDateKey(date) {
      return date.toISOString().split('T')[0];
    },

    isToday(date) {
      const today = new Date();
      return date.toDateString() === today.toDateString();
    },

    formatEventTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    },

    formatEventDate(isoString) {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
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
