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
  // Deep-link support: open an announcement when the URL is edited/pasted while on the page.
  window.addEventListener('hashchange', openAnnouncementFromHash);
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
 * The shareable direct link to an event: an absolute
 * `/calendar/?m=<YYYY-MM>#event-<id>` URL, so a copied value pastes off-site.
 *
 * The month comes from eventDayKey (calendar.js, which baseof.html loads ahead
 * of this file on every page) — it buckets by the event's OWN timezone. Taking
 * the month from the viewer's zone or from the displayed month would name the
 * wrong one for an evening event near a month boundary, which is exactly when
 * nobody would notice. The month is also what makes the link resolvable: the
 * calendar fetches one month at a time and the public API exposes no
 * single-event lookup, so `#event-<id>` alone finds nothing in memory.
 *
 * Null when the event carries no id — there is nothing to anchor to. The `m`
 * parameter is dropped when the start time does not parse; the fragment alone
 * still opens an event that is already loaded.
 */
function eventLinkUrl(event) {
  if (!event || event.id == null) return null;
  const day = eventDayKey(event);
  const query = day ? `?m=${day.slice(0, 7)}` : '';
  return `${location.origin}/calendar/${query}#event-${encodeURIComponent(event.id)}`;
}

/**
 * The share page for an item — `/e/<id>/` for an event, `/a/<id>/` for an
 * announcement. This is what a copy control puts on the clipboard.
 *
 * Reflecting the open item in the address bar and producing a link fit to share
 * are two different jobs. A calendar deep link does the first: it carries the
 * open event in a fragment, which a crawler never receives, so a preview of it
 * can only ever describe the calendar. A share page is a real document per item
 * and previews as that item. Null when there is no id to name.
 */
function shareUrl(kind, id) {
  if (id == null || id === '') return null;
  return `${location.origin}/${kind}/${encodeURIComponent(id)}/`;
}

/**
 * Request a share page so it exists before the copied link is pasted anywhere.
 *
 * Copying does not fetch — the value goes to the clipboard and no request is
 * made — so without this the first request for the page is whatever fetches the
 * pasted link, typically a platform crawler on a short timeout with no retry.
 * That still works (the server generates the page on request), but this moves
 * generation to a moment when nobody is waiting on it.
 *
 * Deliberately fire-and-forget: the caller must not await it, and a failure is
 * harmless because the on-request path still covers the crawler.
 */
function primeSharePage(url) {
  if (typeof fetch !== 'function') return;
  fetch(url, { mode: 'no-cors', credentials: 'omit', keepalive: true }).catch(() => {});
}

/**
 * Show event details in modal
 */
function showEventModal(eventId) {
  const event = contentStore.events[eventId];
  if (!event) return;

  // Render in the event's own IANA zone (from the API), not the viewer's browser
  // zone: a Thu 7pm EST event is Fri 00:00 UTC, so any other zone can show the
  // wrong day and time.
  const tz = event.timezone || undefined;
  const date = new Date(event.start_time);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
    timeZoneName: 'short',
  });

  const imageContainer = document.getElementById('modal-image-container');
  if (event.image_url) {
    const imgUrl = escapeAttr(getImageUrl(event.image_url));
    imageContainer.innerHTML = `<a href="${imgUrl}" target="_blank" title="View full image"><img src="${imgUrl}" alt="" class="modal-image"></a>`;
  } else {
    imageContainer.innerHTML = '';
  }

  // The actual Register control lives here rather than on the card, which is
  // already a single click target. It goes inside modal-meta, which every modal
  // open (event and announcement alike) rewrites wholesale — so a registerable
  // event cannot leave its button behind on the next, non-registerable one.
  const registerUrl = safeRegistrationUrl(event.registration_url);
  const registerBtn = registerUrl
    ? `<p class="modal-register"><a class="btn" href="${escapeAttr(registerUrl)}" target="_blank" rel="noopener">${escapeHtml(registrationLabel(event.guest_price_cents))}</a></p>`
    : '';

  // Two links, two jobs: `link` is the calendar deep link the address bar gets,
  // `share` is the share page the copy control yields.
  const link = eventLinkUrl(event);
  const share = shareUrl('e', event.id);
  const copyBtn = share
    ? '<p><button type="button" class="btn btn-outline" id="modal-copy-link">Copy link</button></p>'
    : '';

  document.getElementById('modal-title').textContent = event.title;
  document.getElementById('modal-meta').innerHTML = `
    <p><span class="meta-label">Date:</span> ${dateStr}</p>
    <p><span class="meta-label">Time:</span> ${timeStr}</p>
    ${event.location ? `<p><span class="meta-label">Location:</span> ${escapeHtml(event.location)}</p>` : ''}
    ${event.event_type ? `<p><span class="meta-label">Type:</span> ${escapeHtml(event.event_type)}</p>` : ''}
    ${registerBtn}
    ${copyBtn}
  `;
  document.getElementById('modal-content').textContent = event.description || 'No description available.';

  // Bind the copy handler to a closure over the share URL. The id is never
  // interpolated into an inline onclick: that attribute is decoded twice (HTML,
  // then JS), and the id is an API value like any other untrusted field.
  if (share) {
    const btn = document.getElementById('modal-copy-link');
    if (btn) btn.onclick = () => copyLink(btn, share);
  }
  // Reflect the open event in the URL, which stays the calendar deep link: it
  // is in-page state for `hashchange` and the history controls, not a share.
  if (link) history.replaceState(null, '', link);

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
    const imgUrl = escapeAttr(getImageUrl(announcement.image_url));
    imageContainer.innerHTML = `<a href="${imgUrl}" target="_blank" title="View full image"><img src="${imgUrl}" alt="" class="modal-image"></a>`;
  } else {
    imageContainer.innerHTML = '';
  }

  document.getElementById('modal-title').textContent = announcement.title;
  document.getElementById('modal-meta').innerHTML = `
    <p><span class="meta-label">Published:</span> ${dateStr}</p>
    ${announcement.announcement_type ? `<p><span class="meta-label">Type:</span> ${escapeHtml(announcement.announcement_type)}</p>` : ''}
    <p><button type="button" class="btn btn-outline" onclick="copyAnnouncementLink(this)">Copy link</button></p>
  `;
  // content_html is server-sanitized by Coterie (ammonia whitelist — safe tag
  // subset, no raw HTML/script/event handlers, only http/https/mailto schemes),
  // so the full body renders it as-is here. Card/banner previews also consume
  // it, but only via truncateHtml (inline tags only, re-emitted bare). Fall
  // back to escaped text when the field is absent (older API).
  const modalContent = document.getElementById('modal-content');
  if (announcement.content_html) {
    modalContent.innerHTML = announcement.content_html;
  } else {
    modalContent.textContent = announcement.content || 'No content available.';
  }

  // Reflect the open announcement in the URL so it can be linked/shared directly.
  if (announcement.id != null) {
    history.replaceState(null, '', '#announcement-' + encodeURIComponent(announcement.id));
  }

  document.getElementById('detail-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the modal
 */
function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
  document.body.style.overflow = '';
  // Drop the deep-link state so the URL reflects that nothing is open. An event
  // link also carries the month it was resolved from, and eventLinkUrl wrote
  // the whole query string, so dropping the query drops exactly that parameter.
  if (location.hash.startsWith('#announcement-')) {
    history.replaceState(null, '', location.pathname + location.search);
  } else if (location.hash.startsWith('#event-')) {
    history.replaceState(null, '', location.pathname);
  }
}

/**
 * Copy a direct link to the clipboard and flash the confirmation on its button.
 * Shared by the event and announcement modals so "Copied!" has exactly one
 * implementation.
 *
 * `?.` short-circuits the WHOLE chain, `.then` included, so an insecure context
 * with no navigator.clipboard is already a silent no-op rather than a throw. The
 * write itself can still reject at runtime — permission denied, or a document
 * that isn't focused — which is what the catch is for: no confirmation flash,
 * but no unhandled rejection either.
 */
function copyLink(btn, url) {
  // Prime the share page before the link can be pasted anywhere. Fired first
  // but never awaited — the clipboard write must not wait on the network.
  primeSharePage(url);
  navigator.clipboard?.writeText(url).then(() => {
    const label = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = label; }, 1500);
  }).catch(() => {});
}

/**
 * Copy the current announcement's direct link to the clipboard.
 */
function copyAnnouncementLink(btn) {
  // The announcement's share page, not the announcements page carrying an
  // `#announcement-<id>` fragment. The fragment stays as it is for in-page
  // state; it just is not what gets shared, for the same reason the event
  // control stopped sharing one. Read the id back from the fragment so this
  // works when the modal was opened from the home-page banner too.
  const m = location.hash.match(/^#announcement-(.+)$/);
  const share = m ? shareUrl('a', decodeURIComponent(m[1])) : null;
  copyLink(btn, share || location.href);
}

/**
 * If the URL points at an announcement (#announcement-<id>), open its modal.
 * No-op if the id isn't among the loaded announcements.
 */
function openAnnouncementFromHash() {
  const m = location.hash.match(/^#announcement-(.+)$/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const card = document.getElementById('announcement-' + id);
  if (card) card.scrollIntoView({ block: 'center' });
  showAnnouncementModal(id);
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
    // The Neon Temple YouTube channel (@theneontemple). channel_id feed returns
    // the latest uploads; swap to playlist_id=UULVjO4E92PJnYuazpZfllS98Q for
    // live-streams-only.
    channelId: 'UCjO4E92PJnYuazpZfllS98Q',

    async init() {
      await this.fetchVideos();
    },

    async fetchVideos() {
      this.loading = true;
      this.error = null;

      try {
        // Fetch YouTube's RSS feed through our own same-origin Caddy proxy
        // (/yt-feed -> www.youtube.com) so we don't depend on flaky public CORS
        // proxies. See the `handle /yt-feed` block in the Caddyfile.
        const response = await fetch(`/yt-feed?channel_id=${this.channelId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xml = await response.text();

        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        this.videos = Array.from(doc.querySelectorAll('entry')).slice(0, 5).map(entry => ({
          id: entry.querySelector('yt\\:videoId, videoId')?.textContent,
          title: entry.querySelector('title')?.textContent || 'Video',
        })).filter(v => v.id);
      } catch (err) {
        // On failure, show nothing - the template falls back to the YouTube button.
        console.error('Failed to load YouTube videos:', err);
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
    // This is a CSS url() context, not HTML — HTML-entity encoding would not be
    // decoded here. Quote the URL and drop it entirely (defense in depth) if it
    // contains any character that could break out of url("..."): quotes,
    // parentheses, backslashes, or whitespace.
    const cssSafeUrl = /["'()\\\s]/.test(imgUrl) ? '' : imgUrl;
    banner.style.backgroundImage = cssSafeUrl ? `url("${cssSafeUrl}")` : '';
    banner.innerHTML = `
      <div class="featured-hero-overlay"></div>
      <div class="featured-hero-content" onclick="showAnnouncementModal('${escapeJsAttr(current.id)}')">
        <div class="featured-hero-badge">Featured</div>
        <h2 class="featured-hero-title">${escapeHtml(current.title)}</h2>
        ${current.content ? `<p class="featured-hero-preview">${previewHtml(current, 120)}</p>` : ''}
        <span class="featured-hero-cta">Click to read more</span>
      </div>
      ${navHtml}
    `;
  } else {
    // Text-only banner (no image)
    banner.className = 'featured-banner';
    banner.innerHTML = `
      <div class="featured-banner-content" onclick="showAnnouncementModal('${escapeJsAttr(current.id)}')">
        <span class="featured-banner-badge">Featured</span>
        <span class="featured-banner-title">${escapeHtml(current.title)}</span>
        ${current.content ? `<span class="featured-banner-preview"> - ${previewHtml(current, 80)}</span>` : ''}
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
          <a href="${window.COTERIE_PORTAL_URL || ''}">Log in to view</a>
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
          <a href="${window.COTERIE_PORTAL_URL || ''}">Log in to view</a>
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
          <a href="${window.COTERIE_PORTAL_URL || ''}">Log in to view</a>
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
    openAnnouncementFromHash();
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
    ? `<div class="card-thumb-large"><img src="${escapeAttr(getImageUrl(announcement.image_url))}" alt=""></div>`
    : '';

  return `
    <div id="announcement-${escapeAttr(announcement.id)}" class="card card-clickable ${announcement.featured ? 'card-featured' : ''}" onclick="showAnnouncementModal('${escapeJsAttr(announcement.id)}')">
      ${imageHtml}
      <div class="card-body">
        <div class="card-header">
          <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
          <div class="card-badges">${featuredBadge}${typeBadge}</div>
        </div>
        <div class="card-meta">${date}</div>
        ${announcement.content ? `<div class="card-description">${previewHtml(announcement, 250)}</div>` : ''}
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
 * Option label for a membership type from GET /public/membership-types:
 * "Name — $45/month", "Name — $500 lifetime", "Name — Free". Whole-dollar
 * fees drop the cents; anything else keeps two decimals.
 */
function formatMembershipOption(type) {
  if (!type.fee_cents) return `${type.name} — Free`;
  const dollars = type.fee_cents / 100;
  const fee = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  switch (type.billing_period) {
    case 'monthly':
      return `${type.name} — ${fee}/month`;
    case 'yearly':
      return `${type.name} — ${fee}/year`;
    case 'lifetime':
      return `${type.name} — ${fee} lifetime`;
    default:
      return `${type.name} — ${fee}/${type.billing_period}`;
  }
}

/**
 * Fill the join form's membership-type select from the API. On failure
 * or an empty list, hide the field entirely — signup then omits the
 * slug and Coterie applies the org-default type (degrade, don't break).
 */
async function populateMembershipTypes(form) {
  const select = form.querySelector('#membership_type_slug');
  if (!select) return;

  try {
    const types = await CoterieAPI.getMembershipTypes();
    if (!types.length) throw new Error('no membership types configured');

    select.innerHTML = '';
    for (const type of types) {
      const option = document.createElement('option');
      option.value = type.slug;
      option.textContent = formatMembershipOption(type);
      select.appendChild(option);
    }
  } catch (err) {
    console.error('Could not load membership types:', err);
    const group = select.closest('.form-group') || select;
    group.style.display = 'none';
    select.value = '';
  }
}

// Coterie rejects passwords over 128 UTF-8 *bytes* — that is what Argon2
// consumes, so the ceiling is measured there and not in characters.
const PASSWORD_MAX_BYTES = 128;

/**
 * The over-length warning for a password, or null when it is within the
 * ceiling. Counts UTF-8 bytes, because `value.length` counts UTF-16 code units
 * and would disagree with the backend on exactly the non-ASCII passwords this
 * exists to help.
 */
function passwordLengthWarning(value) {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes <= PASSWORD_MAX_BYTES) return null;
  return `Too long: ${bytes} bytes, the limit is ${PASSWORD_MAX_BYTES}. Emoji and accented letters take several bytes each.`;
}

/**
 * Swap the password hint for a warning while the entered value is over the
 * ceiling. Advisory only: it never reads back into the field, never blocks
 * submission, and the backend's rejection stays authoritative — which is why
 * the field carries no maxlength (see join.html).
 */
function initPasswordLengthHint(form) {
  const input = form.querySelector('#password');
  const hint = form.querySelector('#password-hint');
  if (!input || !hint) return;

  const bounds = hint.textContent;
  input.addEventListener('input', () => {
    const warning = passwordLengthWarning(input.value);
    hint.textContent = warning || bounds;
    hint.style.color = warning ? 'var(--warning)' : 'var(--text-secondary)';
  });
}

/**
 * Initialize signup form handling
 */
function initSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  populateMembershipTypes(form);
  initPasswordLengthHint(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    // An empty selection (types failed to load / field hidden) must be
    // omitted, not sent as an empty slug — Coterie 400s on unknown slugs
    // and falls back to the org default only when the field is absent.
    if (!data.membership_type_slug) delete data.membership_type_slug;

    // Cloudflare Turnstile injects `cf-turnstile-response` into the form; send it
    // as the `captcha_token` Coterie's bot-challenge verifier expects. Absent when
    // the widget isn't configured (empty turnstileSiteKey) — signup omits it.
    const captchaToken = data['cf-turnstile-response'];
    delete data['cf-turnstile-response'];
    if (captchaToken) data.captcha_token = captchaToken;

    try {
      const result = await CoterieAPI.signup(data);

      // Pay-at-signup: the backend returns a Stripe Checkout URL when
      // the org collects payment during signup. Completing that
      // checkout is what activates the membership — send them there.
      if (result && result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }

      // Show success message
      form.innerHTML = `
        <div class="success-message">
          <h3>Welcome to Neon Temple!</h3>
          <p>Your account has been created. Check your email for next steps.</p>
          <p><a href="${window.COTERIE_PORTAL_URL}" class="btn">Login to Portal</a></p>
        </div>
      `;
    } catch (err) {
      // Turnstile tokens are single-use; reset so a retry mints a fresh one.
      if (window.turnstile) window.turnstile.reset();
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
 * The event's registration URL, but only when it is a genuine absolute
 * http/https URL. It lands in an `href`, where a `javascript:` value would
 * execute in the page's origin — attribute escaping does not stop that, so the
 * scheme is checked even though the value comes from our own API. Anything else
 * (other schemes, relative paths, garbage, absent) yields null and the caller
 * renders no affordance at all. `new URL` throws on unparseable input, hence the
 * try/catch. Rejection is deliberately silent: logging the value would leak it
 * into a shared console.
 */
function safeRegistrationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Label for the registration badge and button: "Register — $30", or
 * "Register — Free" when guest_price_cents is zero or absent. Never "$0.00" —
 * that reads as a pricing bug to a visitor. Whole-dollar prices drop the cents,
 * as in formatMembershipOption.
 */
function registrationLabel(priceCents) {
  if (!priceCents) return 'Register — Free';
  const dollars = priceCents / 100;
  return `Register — ${Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`}`;
}

/**
 * Render an event card
 */
function renderEventCard(event) {
  // Handle private events that appear as placeholders
  if (event.private) {
    const date = formatEventDate(event.start_time, event.timezone);
    return `
      <div class="card card-private">
        <h4 class="card-title"><span class="lock-icon">&#128274;</span> Members Only Event</h4>
        <div class="card-meta">
          <span class="event-date">${date}</span>
        </div>
        <p class="card-description"><a href="${window.COTERIE_PORTAL_URL || ''}">Log in to view details</a></p>
      </div>
    `;
  }

  const date = formatEventDate(event.start_time, event.timezone);
  const location = event.location ? `<span class="event-location">${escapeHtml(event.location)}</span>` : '';
  const imageHtml = event.image_url
    ? `<div class="card-thumb"><img src="${escapeAttr(getImageUrl(event.image_url))}" alt=""></div>`
    : '';
  // Registerable events get a scannable cost badge; almost every event on this
  // calendar is a show-up event and renders nothing here. The badge is inert
  // text — the actionable link lives in the modal so the card keeps a single
  // click target.
  const registrationBadge = safeRegistrationUrl(event.registration_url)
    ? `<span class="badge badge-register">${escapeHtml(registrationLabel(event.guest_price_cents))}</span>`
    : '';

  return `
    <div class="card card-clickable" onclick="showEventModal('${escapeJsAttr(event.id)}')">
      ${imageHtml}
      <div class="card-body">
        <h4 class="card-title">${escapeHtml(event.title)}</h4>
        <div class="card-meta">
          <span class="event-date">${date}</span>
          ${location}
          ${registrationBadge}
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
    ? `<div class="card-thumb"><img src="${escapeAttr(getImageUrl(announcement.image_url))}" alt=""></div>`
    : '';

  return `
    <div class="card card-clickable" onclick="showAnnouncementModal('${escapeJsAttr(announcement.id)}')">
      ${imageHtml}
      <div class="card-body">
        <h4 class="card-title">${escapeHtml(announcement.title)}</h4>
        <div class="card-meta">${date}</div>
        ${announcement.content ? `<p class="card-description">${previewHtml(announcement, 120)}</p>` : ''}
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
    const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: event.timezone || undefined });

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
function formatEventDate(isoString, tz) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz || undefined,
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

// Inline formatting worth keeping in a card/banner preview. Everything else is
// unwrapped to its text: block tags would be invalid inside the <p>/<span>
// preview wrappers, and links would nest a click target inside the card's
// onclick.
const PREVIEW_INLINE_TAGS = ['em', 'strong', 'del', 's', 'code', 'sub', 'sup', 'mark', 'u', 'i', 'b'];

/**
 * Truncate Coterie's server-sanitized content_html to ~length visible
 * characters without breaking markup: tags and entities are never split, only
 * PREVIEW_INLINE_TAGS are kept (re-emitted bare, attributes dropped), dropped
 * block tags become a space so words don't run together, and tags still open
 * at the cut are closed. Assumes sanitized input (balanced tags, text/attr
 * values entity-encoded) — same trust basis as the modal's innerHTML use; it
 * is not a general HTML parser.
 */
function truncateHtml(html, length) {
  const open = [];
  let out = '';
  let visible = 0;
  let i = 0;
  while (i < html.length && visible < length) {
    const ch = html[i];
    if (ch === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) break; // malformed tail — drop it
      const m = /^<(\/?)([a-z0-9]+)/i.exec(html.slice(i, end + 1));
      const name = m && m[2].toLowerCase();
      if (name && PREVIEW_INLINE_TAGS.includes(name)) {
        if (!m[1]) {
          open.push(name);
          out += `<${name}>`;
        } else if (open[open.length - 1] === name) {
          open.pop();
          out += `</${name}>`;
        }
      } else if (out && !/\s$/.test(out)) {
        out += ' '; // dropped block tag (p, li, br, ...) separates words
        visible++;
      }
      i = end + 1;
    } else if (ch === '&') {
      const end = html.indexOf(';', i + 1);
      if (end !== -1 && end - i <= 9) {
        out += html.slice(i, end + 1); // entity is one visible character
        i = end + 1;
      } else {
        out += '&amp;'; // bare & — not expected from the sanitizer
        i++;
      }
      visible++;
    } else {
      out += ch;
      i++;
      visible++;
    }
  }
  out = out.replace(/\s+$/, '');
  if (i < html.length) out += '...';
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/**
 * Preview snippet for an announcement: inline-formatted truncation of
 * content_html when the API provides it, escaped raw content otherwise.
 */
function previewHtml(announcement, length) {
  return announcement.content_html
    ? truncateHtml(announcement.content_html, length)
    : escapeHtml(truncate(announcement.content, length));
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
 * Escape a value for safe insertion into an HTML attribute context.
 *
 * Unlike escapeHtml — which round-trips through textContent and therefore leaves
 * `"` and `'` intact — this also escapes the quote characters, so the value
 * cannot terminate the attribute it sits in or introduce additional markup,
 * attributes, or event handlers. Use this for any untrusted value placed inside
 * an HTML attribute (href, src, etc.). Do NOT use escapeHtml for attributes.
 */
function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a value for a single-quoted JS string literal that itself sits inside a
 * double-quoted HTML attribute — e.g. onclick="showEventModal('VALUE')".
 *
 * This context is decoded twice: the HTML parser decodes entities in the
 * attribute value first, then the JS engine parses the result as code. So
 * escapeHtml/escapeAttr are NOT sufficient here — entity-encoding the apostrophe
 * to &#39; would just be decoded back to ' before the JS runs, reopening the
 * breakout. We therefore (1) JS-escape the characters that would break the
 * single-quoted string after HTML decoding (backslash, apostrophe, and raw line
 * terminators), then (2) HTML-escape the characters that would otherwise break
 * the surrounding double-quoted attribute or be reinterpreted by the HTML parser
 * (&, ", <, >). The apostrophe is deliberately JS-escaped (\') rather than
 * entity-encoded. The value round-trips to the original string, so it remains a
 * valid contentStore lookup key.
 */
function escapeJsAttr(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
