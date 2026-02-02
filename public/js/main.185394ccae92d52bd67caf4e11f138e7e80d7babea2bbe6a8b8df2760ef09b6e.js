/**
 * Neon Temple - Main JavaScript
 * Handles page initialization and dynamic content loading
 */

// Store for full content to show in modals (global for calendar.js access)
const contentStore = {
  events: {},
  announcements: {},
};
window.contentStore = contentStore;

document.addEventListener('DOMContentLoaded', () => {
  createModal();
  initAnnouncementBanner();
  initPageSpecific();
});

/**
 * Create the modal element
 */
function createModal() {
  const modal = document.createElement('div');
  modal.id = 'detail-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-image-container"></div>
      <div class="modal-body">
        <h3 id="modal-title"></h3>
        <div id="modal-meta" class="modal-meta"></div>
        <div id="modal-content" class="modal-content"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/**
 * Show event details in modal
 */
function showEventModal(eventId) {
  const event = contentStore.events[eventId];
  if (!event) return;

  const date = new Date(event.start_time);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const imageContainer = document.getElementById('modal-image-container');
  if (event.image_url) {
    const imgUrl = getImageUrl(event.image_url);
    imageContainer.innerHTML = `<a href="${imgUrl}" target="_blank" title="View full image"><img src="${imgUrl}" alt="" class="modal-image"></a>`;
  } else {
    imageContainer.innerHTML = '';
  }

  document.getElementById('modal-title').textContent = event.title;
  document.getElementById('modal-meta').innerHTML = `
    <p><span class="meta-label">Date:</span> ${dateStr}</p>
    <p><span class="meta-label">Time:</span> ${timeStr}</p>
    ${event.location ? `<p><span class="meta-label">Location:</span> ${escapeHtml(event.location)}</p>` : ''}
    ${event.event_type ? `<p><span class="meta-label">Type:</span> ${escapeHtml(event.event_type)}</p>` : ''}
  `;
  document.getElementById('modal-content').textContent = event.description || 'No description available.';

  document.getElementById('detail-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Show announcement details in modal
 */
function showAnnouncementModal(announcementId) {
  const announcement = contentStore.announcements[announcementId];
  if (!announcement) return;

  const date = new Date(announcement.published_at || announcement.created_at);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const imageContainer = document.getElementById('modal-image-container');
  if (announcement.image_url) {
    const imgUrl = getImageUrl(announcement.image_url);
    imageContainer.innerHTML = `<a href="${imgUrl}" target="_blank" title="View full image"><img src="${imgUrl}" alt="" class="modal-image"></a>`;
  } else {
    imageContainer.innerHTML = '';
  }

  document.getElementById('modal-title').textContent = announcement.title;
  document.getElementById('modal-meta').innerHTML = `
    <p><span class="meta-label">Published:</span> ${dateStr}</p>
    ${announcement.announcement_type ? `<p><span class="meta-label">Type:</span> ${escapeHtml(announcement.announcement_type)}</p>` : ''}
  `;
  document.getElementById('modal-content').textContent = announcement.content || 'No content available.';

  document.getElementById('detail-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the modal
 */
function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
  document.body.style.overflow = '';
}

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
    // Live streams playlist (UULV prefix) for channel UCv865b5CV4mtKw2YJ8uqU_A
    playlistId: 'UULVv865b5CV4mtKw2YJ8uqU_A',

    async init() {
      await this.fetchVideos();
    },

    async fetchVideos() {
      this.loading = true;
      this.error = null;

      // Try multiple CORS proxies in case one is down
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${this.playlistId}`;
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
 * Featured banner state
 */
let featuredBannerState = {
  announcements: [],
  currentIndex: 0,
  timer: null,
  rotateInterval: 6000, // 6 seconds per announcement
};

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

    // Store featured announcements for modal access
    featured.forEach(a => contentStore.announcements[a.id] = a);

    // Set up rotation state
    featuredBannerState.announcements = featured;
    featuredBannerState.currentIndex = 0;

    // Render the banner
    renderFeaturedBanner(banner);
    banner.classList.remove('hidden');

    // Start auto-rotation if multiple featured
    if (featured.length > 1) {
      startBannerRotation(banner);

      // Pause rotation on hover
      banner.addEventListener('mouseenter', () => stopBannerRotation());
      banner.addEventListener('mouseleave', () => startBannerRotation(banner));
    }
  } catch (err) {
    console.log('Could not load announcements');
  }
}

function startBannerRotation(banner) {
  stopBannerRotation();
  featuredBannerState.timer = setInterval(() => {
    featuredBannerState.currentIndex =
      (featuredBannerState.currentIndex + 1) % featuredBannerState.announcements.length;
    renderFeaturedBanner(banner);
  }, featuredBannerState.rotateInterval);
}

function stopBannerRotation() {
  if (featuredBannerState.timer) {
    clearInterval(featuredBannerState.timer);
    featuredBannerState.timer = null;
  }
}

function goToFeaturedSlide(index, banner) {
  featuredBannerState.currentIndex = index;
  renderFeaturedBanner(banner || document.getElementById('announcement-banner'));
  // Reset timer
  const bannerEl = banner || document.getElementById('announcement-banner');
  if (featuredBannerState.announcements.length > 1) {
    startBannerRotation(bannerEl);
  }
}

/**
 * Render featured announcement as hero banner
 */
function renderFeaturedBanner(banner) {
  const { announcements, currentIndex } = featuredBannerState;
  const current = announcements[currentIndex];
  const hasImage = !!current.image_url;
  const count = announcements.length;

  // Navigation with arrows, dots, and counter (if multiple)
  const navHtml = count > 1 ? `
    <div class="featured-hero-nav">
      <button class="featured-hero-arrow" onclick="event.stopPropagation(); goToFeaturedSlide(${(currentIndex - 1 + count) % count})" aria-label="Previous">&larr;</button>
      <div class="featured-hero-dots">
        ${announcements.map((a, i) => `
          <button
            class="featured-hero-dot ${i === currentIndex ? 'active' : ''}"
            onclick="event.stopPropagation(); goToFeaturedSlide(${i})"
            aria-label="Go to announcement ${i + 1}"
          ></button>
        `).join('')}
      </div>
      <button class="featured-hero-arrow" onclick="event.stopPropagation(); goToFeaturedSlide(${(currentIndex + 1) % count})" aria-label="Next">&rarr;</button>
      <span class="featured-hero-counter">${currentIndex + 1} / ${count}</span>
    </div>
  ` : '';

  if (hasImage) {
    // Hero banner with background image
    const imgUrl = getImageUrl(current.image_url);
    banner.className = 'featured-hero';
    banner.style.backgroundImage = `url(${imgUrl})`;
    banner.innerHTML = `
      <div class="featured-hero-overlay"></div>
      <div class="featured-hero-content" onclick="showAnnouncementModal('${current.id}')">
        <div class="featured-hero-badge">Featured</div>
        <h2 class="featured-hero-title">${escapeHtml(current.title)}</h2>
        ${current.content ? `<p class="featured-hero-preview">${escapeHtml(truncate(current.content, 120))}</p>` : ''}
        <span class="featured-hero-cta">Click to read more</span>
      </div>
      ${navHtml}
    `;
  } else {
    // Text-only banner (no image)
    banner.className = 'featured-banner';
    banner.innerHTML = `
      <div class="featured-banner-content" onclick="showAnnouncementModal('${current.id}')">
        <span class="featured-banner-badge">Featured</span>
        <span class="featured-banner-title">${escapeHtml(current.title)}</span>
        ${current.content ? `<span class="featured-banner-preview"> - ${escapeHtml(truncate(current.content, 80))}</span>` : ''}
      </div>
      ${navHtml}
    `;
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

    // Try to get private count separately so it doesn't break main content
    let privateCount = 0;
    try {
      const result = await CoterieAPI.getPrivateEventCount();
      privateCount = result?.count || 0;
    } catch (e) {
      // Endpoint may not exist yet, ignore
    }

    let html = '';

    // Show members-only teaser if there are private events
    if (privateCount > 0) {
      const plural = privateCount === 1 ? '' : 's';
      html += `
        <div class="members-only-teaser">
          <span class="lock-icon">&#128274;</span>
          <span>${privateCount} members-only event${plural}</span>
          <a href="${window.COTERIE_PORTAL_URL || ''}/portal">Log in to view</a>
        </div>
      `;
    }

    if (events.length === 0 && privateCount === 0) {
      container.innerHTML = '<p class="empty">No upcoming events</p>';
      return;
    }

    // Store events for modal access
    events.forEach(e => contentStore.events[e.id] = e);

    html += events.map(event => renderEventCard(event)).join('');
    container.innerHTML = html;
    detectThumbnailAspectRatios();
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

    // Try to get private count separately so it doesn't break main content
    let privateCount = 0;
    try {
      const result = await CoterieAPI.getPrivateAnnouncementCount();
      privateCount = result?.count || 0;
    } catch (e) {
      // Endpoint may not exist yet, ignore
    }

    let html = '';

    // Show members-only teaser if there are private announcements
    if (privateCount > 0) {
      const plural = privateCount === 1 ? '' : 's';
      html += `
        <div class="members-only-teaser">
          <span class="lock-icon">&#128274;</span>
          <span>${privateCount} members-only announcement${plural}</span>
          <a href="${window.COTERIE_PORTAL_URL || ''}/portal/announcements">Log in to view</a>
        </div>
      `;
    }

    if (announcements.length === 0 && privateCount === 0) {
      container.innerHTML = '<p class="empty">No recent announcements</p>';
      return;
    }

    // Store announcements for modal access
    announcements.forEach(a => contentStore.announcements[a.id] = a);

    html += announcements.map(a => renderAnnouncementCard(a)).join('');
    container.innerHTML = html;
    detectThumbnailAspectRatios();
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

    // Try to get private count separately
    let privateCount = 0;
    try {
      const result = await CoterieAPI.getPrivateAnnouncementCount();
      privateCount = result?.count || 0;
    } catch (e) {
      // Endpoint may not exist yet, ignore
    }

    let html = '';

    // Show members-only teaser if there are private announcements
    if (privateCount > 0) {
      const plural = privateCount === 1 ? '' : 's';
      html += `
        <div class="members-only-teaser">
          <span class="lock-icon">&#128274;</span>
          <span>${privateCount} members-only announcement${plural}</span>
          <a href="${window.COTERIE_PORTAL_URL || ''}/portal/announcements">Log in to view</a>
        </div>
      `;
    }

    if (announcements.length === 0 && privateCount === 0) {
      container.innerHTML = '<p class="empty">No announcements</p>';
      return;
    }

    // Store announcements for modal access
    announcements.forEach(a => contentStore.announcements[a.id] = a);

    html += announcements.map(a => renderAnnouncementCardFull(a)).join('');
    container.innerHTML = html;
    detectThumbnailAspectRatios();
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
  const imageHtml = announcement.image_url
    ? `<div class="card-thumb-large"><img src="${getImageUrl(announcement.image_url)}" alt=""></div>`
    : '';

  return `
    <div class="card card-clickable ${announcement.featured ? 'card-featured' : ''}" onclick="showAnnouncementModal('${announcement.id}')">
      ${imageHtml}
      <div class="card-body">
        <div class="card-header">
          <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
          <div class="card-badges">${featuredBadge}${typeBadge}</div>
        </div>
        <div class="card-meta">${date}</div>
        ${announcement.content ? `<div class="card-description">${escapeHtml(truncate(announcement.content, 250))}</div>` : ''}
      </div>
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
  // Handle private events that appear as placeholders
  if (event.private) {
    const date = formatEventDate(event.start_time);
    return `
      <div class="card card-private">
        <h4 class="card-title"><span class="lock-icon">&#128274;</span> Members Only Event</h4>
        <div class="card-meta">
          <span class="event-date">${date}</span>
        </div>
        <p class="card-description"><a href="${window.COTERIE_PORTAL_URL || ''}/portal">Log in to view details</a></p>
      </div>
    `;
  }

  const date = formatEventDate(event.start_time);
  const location = event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : '';
  const imageHtml = event.image_url
    ? `<div class="card-thumb"><img src="${getImageUrl(event.image_url)}" alt=""></div>`
    : '';

  return `
    <div class="card card-clickable" onclick="showEventModal('${event.id}')">
      ${imageHtml}
      <div class="card-body">
        <h4 class="card-title">${escapeHtml(event.title)}</h4>
        <div class="card-meta">
          <span class="event-date">${date}</span>
          ${location}
        </div>
        ${event.description ? `<p class="card-description">${escapeHtml(truncate(event.description, 100))}</p>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render an announcement card
 */
function renderAnnouncementCard(announcement) {
  const date = formatDate(announcement.published_at);
  const imageHtml = announcement.image_url
    ? `<div class="card-thumb"><img src="${getImageUrl(announcement.image_url)}" alt=""></div>`
    : '';

  return `
    <div class="card card-clickable" onclick="showAnnouncementModal('${announcement.id}')">
      ${imageHtml}
      <div class="card-body">
        <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
        <div class="card-meta">${date}</div>
        ${announcement.content ? `<p class="card-description">${escapeHtml(truncate(announcement.content, 120))}</p>` : ''}
      </div>
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
 * Detect image aspect ratio and add appropriate class to thumbnail container
 * Call this after rendering cards with images
 */
function detectThumbnailAspectRatios() {
  document.querySelectorAll('.card-thumb img, .card-thumb-large img').forEach(img => {
    if (img.complete) {
      applyAspectClass(img);
    } else {
      img.addEventListener('load', () => applyAspectClass(img));
    }
  });
}

function applyAspectClass(img) {
  const container = img.parentElement;
  if (!container) return;

  const ratio = img.naturalWidth / img.naturalHeight;
  // If image is tall (portrait), add class
  if (ratio < 0.9) {
    container.classList.add('thumb-tall');
  }
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

/**
 * Get full image URL from image path
 * Handles both relative paths (uploads/...) and absolute URLs (https://...)
 */
function getImageUrl(imagePath) {
  if (!imagePath) return '';
  // If it's already a full URL, return as-is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  // Otherwise, prepend the API URL
  const baseUrl = window.COTERIE_API_URL || '';
  return `${baseUrl}/${imagePath}`;
}
