/**
 * Coterie API Client
 * Handles communication with the Coterie membership backend
 */

const CoterieAPI = {
  baseURL: window.COTERIE_API_URL || '',

  /**
   * Fetch wrapper with error handling
   */
  async fetch(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      console.error(`API Error (${endpoint}):`, err);
      throw err;
    }
  },

  /**
   * Get public events
   * @param {Object} params - Query parameters
   * @param {number} params.limit - Max number of events
   * @param {string} params.type - Filter by event type slug
   * @returns {Promise<Array>} List of events
   */
  async getEvents({ limit, type } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit);
    if (type) params.set('type', type);

    const query = params.toString();
    return this.fetch(`/public/events${query ? '?' + query : ''}`);
  },

  /**
   * Get public announcements
   * @param {Object} params - Query parameters
   * @param {number} params.limit - Max number of announcements
   * @param {string} params.type - Filter by announcement type slug
   * @returns {Promise<Array>} List of announcements
   */
  async getAnnouncements({ limit, type } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit);
    if (type) params.set('type', type);

    const query = params.toString();
    return this.fetch(`/public/announcements${query ? '?' + query : ''}`);
  },

  /**
   * Get featured announcement (if any)
   * @returns {Promise<Object|null>} Featured announcement or null
   */
  async getFeaturedAnnouncement() {
    const announcements = await this.getAnnouncements({ limit: 10 });
    return announcements.find(a => a.featured) || null;
  },

  /**
   * Submit membership signup
   * @param {Object} data - Signup form data
   * @returns {Promise<Object>} Signup result
   */
  async signup(data) {
    return this.fetch('/public/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get the iCal calendar feed URL
   * @returns {string} Calendar feed URL
   */
  getCalendarFeedURL() {
    return `${this.baseURL}/public/feed/calendar`;
  },

  /**
   * Get the RSS feed URL
   * @returns {string} RSS feed URL
   */
  getRSSFeedURL() {
    return `${this.baseURL}/public/feed/rss`;
  },

  /**
   * Get count of members-only announcements
   * @returns {Promise<Object>} Object with count property
   */
  async getPrivateAnnouncementCount() {
    return this.fetch('/public/announcements/private-count');
  },

  /**
   * Get count of members-only upcoming events
   * @returns {Promise<Object>} Object with count property
   */
  async getPrivateEventCount() {
    return this.fetch('/public/events/private-count');
  },

  /**
   * Health check
   * @returns {Promise<boolean>} True if API is reachable
   */
  async healthCheck() {
    try {
      await fetch(`${this.baseURL}/health`);
      return true;
    } catch {
      return false;
    }
  },
};

// Make available globally
window.CoterieAPI = CoterieAPI;
