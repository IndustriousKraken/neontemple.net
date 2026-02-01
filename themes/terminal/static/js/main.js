/**
 * Neon Temple - Main JavaScript
 * Handles page initialization and dynamic content loading
 */

document.addEventListener('DOMContentLoaded', () => {
  initAnnouncementBanner();
  initPageSpecific();
});

/**
 * Alpine.js Video Slider Component
 * Fetches recent videos from YouTube RSS feed
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('videoSlider', () => ({
    videos: [],
    currentVideo: 0,
    loading: true,
    error: null,
    channelId: 'UCv865b5CV4mtKw2YJ8uqU_A',

    async init() {
      await this.fetchVideos();
    },

    async fetchVideos() {
      this.loading = true;
      this.error = null;

      // Try multiple CORS proxies in case one is down
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${this.channelId}`;
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
      ];

      let xml = null;
      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl);
          if (response.ok) {
            xml = await response.text();
            if (xml && xml.includes('<entry>')) break;
          }
        } catch (e) {
          console.log('Proxy failed:', proxyUrl);
        }
      }

      try {
        if (!xml || !xml.includes('<entry>')) throw new Error('All proxies failed');

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');

        const entries = doc.querySelectorAll('entry');
        this.videos = Array.from(entries).slice(0, 5).map(entry => {
          const videoId = entry.querySelector('yt\\:videoId, videoId')?.textContent;
          const title = entry.querySelector('title')?.textContent;
          return { id: videoId, title: title || 'Video' };
        }).filter(v => v.id);

        if (this.videos.length === 0) {
          throw new Error('No videos found');
        }
        this.error = null;
      } catch (err) {
        console.error('Failed to load YouTube videos:', err);
        // On failure, show nothing - just link to YouTube
        this.error = null;
        this.videos = [];
      } finally {
        this.loading = false;
      }
    }
  }));
});

/**
 * Load and display featured announcements in banner
 */
async function initAnnouncementBanner() {
  const banner = document.getElementById('announcement-banner');
  if (!banner) return;

  try {
    const announcements = await CoterieAPI.getAnnouncements({ limit: 10 });
    const featured = announcements.filter(a => a.featured);

    if (featured.length === 0) return;

    // Store announcements for expansion
    banner.dataset.announcements = JSON.stringify(featured);
    banner.dataset.expanded = 'false';

    // Render collapsed state
    renderBannerCollapsed(banner, featured);
    banner.classList.remove('hidden');

    // Click to expand/collapse
    banner.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return; // Don't toggle on link clicks
      toggleBanner(banner, featured);
    });
  } catch (err) {
    console.log('Could not load announcements');
  }
}

function renderBannerCollapsed(banner, featured) {
  const first = featured[0];
  const moreCount = featured.length - 1;
  const countBadge = moreCount > 0
    ? `<span class="banner-count">+${moreCount} more</span>`
    : '';

  banner.innerHTML = `
    <div class="banner-collapsed">
      <span class="banner-title"><strong>${escapeHtml(first.title)}</strong></span>
      ${first.content ? `<span class="banner-preview"> - ${escapeHtml(truncate(first.content, 80))}</span>` : ''}
      ${countBadge}
      <span class="banner-expand-hint">Click to expand</span>
    </div>
  `;
  banner.dataset.expanded = 'false';
}

function renderBannerExpanded(banner, featured) {
  let html = '<div class="banner-expanded">';

  for (const announcement of featured) {
    html += `
      <div class="banner-announcement">
        <div class="banner-announcement-title"><strong>${escapeHtml(announcement.title)}</strong></div>
        <div class="banner-announcement-meta">${formatDate(announcement.published_at)}</div>
        ${announcement.content ? `<div class="banner-announcement-content">${escapeHtml(announcement.content)}</div>` : ''}
      </div>
    `;
  }

  html += `
    <div class="banner-footer">
      <a href="/announcements/">View all announcements</a>
      <span class="banner-collapse-hint">Click to collapse</span>
    </div>
  </div>`;

  banner.innerHTML = html;
  banner.dataset.expanded = 'true';
}

function toggleBanner(banner, featured) {
  if (banner.dataset.expanded === 'true') {
    renderBannerCollapsed(banner, featured);
  } else {
    renderBannerExpanded(banner, featured);
  }
}

/**
 * Initialize page-specific functionality
 */
function initPageSpecific() {
  const page = document.body.dataset.page;

  switch (page) {
    case 'home':
      loadHomeEvents();
      loadHomeAnnouncements();
      break;
    case 'announcements':
      loadAllAnnouncements();
      break;
    case 'join':
      initSignupForm();
      break;
    // 'calendar' is now handled by Alpine.js
  }
}

/**
 * Load events for homepage
 */
async function loadHomeEvents() {
  const container = document.getElementById('home-events');
  if (!container) return;

  container.innerHTML = '<p class="loading">Loading events</p>';

  try {
    const events = await CoterieAPI.getEvents({ limit: 3 });

    if (events.length === 0) {
      container.innerHTML = '<p class="empty">No upcoming events</p>';
      return;
    }

    container.innerHTML = events.map(event => renderEventCard(event)).join('');
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load events</p>';
  }
}

/**
 * Load announcements for homepage
 */
async function loadHomeAnnouncements() {
  const container = document.getElementById('home-announcements');
  if (!container) return;

  container.innerHTML = '<p class="loading">Loading announcements</p>';

  try {
    const announcements = await CoterieAPI.getAnnouncements({ limit: 3 });

    if (announcements.length === 0) {
      container.innerHTML = '<p class="empty">No recent announcements</p>';
      return;
    }

    container.innerHTML = announcements.map(a => renderAnnouncementCard(a)).join('');
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load announcements</p>';
  }
}

/**
 * Load all announcements for announcements page
 */
async function loadAllAnnouncements() {
  const container = document.getElementById('all-announcements');
  if (!container) return;

  container.innerHTML = '<p class="loading">Loading announcements</p>';

  try {
    const announcements = await CoterieAPI.getAnnouncements({ limit: 50 });

    if (announcements.length === 0) {
      container.innerHTML = '<p class="empty">No announcements</p>';
      return;
    }

    container.innerHTML = announcements.map(a => renderAnnouncementCardFull(a)).join('');
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load announcements</p>';
  }
}

/**
 * Render a full announcement card (for announcements page)
 */
function renderAnnouncementCardFull(announcement) {
  const date = formatDate(announcement.published_at);
  const featuredBadge = announcement.featured
    ? '<span class="badge badge-featured">Featured</span>'
    : '';
  const typeBadge = announcement.announcement_type
    ? `<span class="badge">${escapeHtml(announcement.announcement_type)}</span>`
    : '';

  return `
    <div class="card ${announcement.featured ? 'card-featured' : ''}">
      <div class="card-header">
        <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
        <div class="card-badges">${featuredBadge}${typeBadge}</div>
      </div>
      <div class="card-meta">${date}</div>
      ${announcement.content ? `<div class="card-content">${escapeHtml(announcement.content)}</div>` : ''}
    </div>
  `;
}

/**
 * Load all events for calendar page
 */
async function loadCalendarEvents() {
  const container = document.getElementById('calendar-events');
  if (!container) return;

  container.innerHTML = '<p class="loading">Loading calendar</p>';

  try {
    const events = await CoterieAPI.getEvents({ limit: 50 });

    if (events.length === 0) {
      container.innerHTML = '<p class="empty">No upcoming events scheduled</p>';
      return;
    }

    // Group events by month
    const grouped = groupEventsByMonth(events);
    let html = '';

    for (const [month, monthEvents] of Object.entries(grouped)) {
      html += `
        <div class="calendar-month">
          <h3 class="calendar-month-title">${month}</h3>
          <div class="card-list">
            ${monthEvents.map(e => renderEventCard(e)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load calendar</p>';
  }
}

/**
 * Initialize signup form handling
 */
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      await CoterieAPI.signup(data);

      // Show success message
      form.innerHTML = `
        <div class="success-message">
          <h3>Welcome to Neon Temple!</h3>
          <p>Your account has been created. Check your email for next steps.</p>
          <p><a href="${window.COTERIE_PORTAL_URL}" class="btn">Login to Portal</a></p>
        </div>
      `;
    } catch (err) {
      // Show error
      const errorEl = form.querySelector('.form-error') || document.createElement('div');
      errorEl.className = 'form-error error';
      errorEl.textContent = err.message || 'Signup failed. Please try again.';

      if (!form.querySelector('.form-error')) {
        form.insertBefore(errorEl, submitBtn);
      }

      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

/**
 * Render an event card
 */
function renderEventCard(event) {
  const date = formatEventDate(event.start_time);
  const location = event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : '';

  return `
    <div class="card">
      <h4 class="card-title">${escapeHtml(event.title)}</h4>
      <div class="card-meta">
        <span class="event-date">${date}</span>
        ${location}
      </div>
      ${event.description ? `<p class="card-description">${escapeHtml(truncate(event.description, 150))}</p>` : ''}
    </div>
  `;
}

/**
 * Render an announcement card
 */
function renderAnnouncementCard(announcement) {
  const date = formatDate(announcement.published_at);

  return `
    <div class="card">
      <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
      <div class="card-meta">${date}</div>
      ${announcement.content ? `<p class="card-description">${escapeHtml(truncate(announcement.content, 200))}</p>` : ''}
    </div>
  `;
}

/**
 * Group events by month
 */
function groupEventsByMonth(events) {
  const grouped = {};

  for (const event of events) {
    const date = new Date(event.start_time);
    const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!grouped[month]) {
      grouped[month] = [];
    }
    grouped[month].push(event);
  }

  return grouped;
}

/**
 * Format event date/time
 */
function formatEventDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format date only
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Truncate string
 */
function truncate(str, length) {
  if (!str || str.length <= length) return str;
  return str.slice(0, length).trim() + '...';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
