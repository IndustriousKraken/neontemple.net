#!/usr/bin/env node
/**
 * Share pages for theneontemple.com — /e/<id>/ per public event, /a/<id>/ per
 * public announcement.
 *
 * Two entry points, ONE renderer:
 *
 *   share-pages.js refresh   reconcile every page against the public API
 *                            (share-pages.service, run by share-pages.timer)
 *   share-pages.js serve     loopback responder that generates a page on the
 *                            first request for one that does not exist yet
 *                            (share-pages-responder.service)
 *
 * Both call renderPage() against the same Hugo-built template, so the two paths
 * cannot drift. Drift here would only ever be visible in a link preview, which
 * is the hardest place on earth to notice a bug.
 *
 * Why this is safe to run unattended: /public/events sanitizes members-only
 * entries BEFORE they leave Coterie — title becomes "Members-Only Event" and
 * description, location, and image_url are nulled. The feed this reads contains
 * no private content, so the worst outcome of a selection bug is a useless page
 * titled "Members-Only Event", not a disclosure.
 *
 * See ./README.md for install, config, and the immediate-purge command.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

// --- configuration -------------------------------------------------------

function loadConfig(env = process.env) {
  const trim = (v) => String(v).replace(/\/+$/, '');
  return {
    api: trim(env.SHARE_API || 'https://coterie.theneontemple.com'),
    site: trim(env.SHARE_SITE || 'https://theneontemple.com'),
    root: env.SHARE_ROOT || '/srv/theneontemple.com',
    manifest: env.SHARE_MANIFEST || '/var/lib/share-pages/manifest.json',
    port: Number(env.SHARE_PORT || 8787),
  };
}

// Hugo builds the template to this path; see themes/terminal/layouts/_default/
// share.html for why its depth matches a share page's.
const templatePath = (cfg) => path.join(cfg.root, '_share', 'template', 'index.html');

// The refresher's own crawlable index. The calendar's links to events are
// rendered by script and absent from the served HTML, so without this a crawler
// walking the site never reaches a share page. robots.txt points at it.
const sitemapPath = (cfg) => path.join(cfg.root, 'share-sitemap.xml');

// Site-level card, from static/img/share-card.png. Used as og:image for an item
// that has no image of its own — a card with no image is a thin grey strip.
const defaultImage = (cfg) => `${cfg.site}/img/share-card.png`;

/**
 * The polling window. Reaching back means a link shared before an event still
 * previews for weeks after it ends; reaching forward covers everything on the
 * public calendar. It is a POLLING bound, never a retention bound: an item that
 * ages out stops being re-fetched and its page is served forever (see
 * reconcile). Re-fetching years of events that will never change again is work
 * that grows without bound; serving an already-written file costs nothing.
 */
const WINDOW_PAST_DAYS = 45;
const WINDOW_FUTURE_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

function pollWindow(now = new Date()) {
  return {
    from: new Date(now.getTime() - WINDOW_PAST_DAYS * DAY_MS),
    to: new Date(now.getTime() + WINDOW_FUTURE_DAYS * DAY_MS),
  };
}

// --- escaping ------------------------------------------------------------

/**
 * One escape for both contexts this fills: element text and attribute value.
 * Escaping the quotes as well as the angle brackets is what makes a single
 * function correct in an attribute, including an UNQUOTED one — `hugo --minify`
 * drops attribute quotes, so `src=%%IMAGE_URL%%` is a real output context.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve an API image path to an absolute URL. The API returns paths like
 * `uploads/<uuid>.jpg`, relative to Coterie and not to this site, and a crawler
 * resolves og:image against nothing at all.
 *
 * Returns null for a missing path or a non-http(s) scheme. The URL parser also
 * percent-encodes whitespace and quotes, which is the other half of surviving
 * an unquoted attribute.
 */
function absoluteImageUrl(imagePath, apiOrigin) {
  if (!imagePath) return null;
  const raw = /^https?:\/\//i.test(imagePath)
    ? String(imagePath)
    : `${apiOrigin}/${String(imagePath).replace(/^\/+/, '')}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

/** Markup stripped, entities decoded, whitespace collapsed. */
function plainText(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bound to what platforms actually render, cut on a word boundary. */
function boundText(text, max = 200) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:—-]+$/, '')}…`;
}

// Ids reach a filesystem path and a URL, so they are validated — as untrusted
// API values, and as untrusted request path segments — before either.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const validId = (id) => ID_PATTERN.test(String(id ?? ''));

// --- rendering (the ONE renderer) ----------------------------------------

/**
 * Keep or drop the template's `<share-NAME>…</share-NAME>` regions. The wrapper
 * element is always removed; only its contents are conditional. Regions do not
 * nest — flatten instead, the matcher is deliberately non-recursive.
 */
function fillRegions(html, flags) {
  let out = html;
  for (const [name, keep] of Object.entries(flags)) {
    const region = new RegExp(`<share-${name}>([\\s\\S]*?)</share-${name}>`, 'g');
    out = out.replace(region, (_match, inner) => (keep ? inner : ''));
  }
  return out;
}

/**
 * Substitute `%%TOKEN%%` placeholders. Values are consumed as-is: they are
 * already escaped by renderPage for the context they land in. One left-to-right
 * pass, so a value that happens to contain `%%…%%` is never re-scanned.
 */
function fillTokens(html, tokens) {
  return html.replace(/%%([A-Z_]+)%%/g, (_match, name) =>
    Object.prototype.hasOwnProperty.call(tokens, name) ? tokens[name] : '');
}

function formatDate(iso, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

function formatTime(iso, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: timezone,
  });
}

/**
 * Fill the template for one item. `kind` is 'e' (event) or 'a' (announcement).
 *
 * Every interpolated value is escaped here except ANNOUNCEMENT_HTML, which is
 * Coterie's server-sanitized `content_html` (ammonia whitelist — safe tag
 * subset, no scripts or event handlers) and is the one value rendered as
 * markup. That is the same value main.js renders in the announcement modal.
 */
function renderPage(template, kind, item, cfg) {
  const isEvent = kind === 'e';
  const image = absoluteImageUrl(item.image_url, cfg.api);
  // The event's own IANA zone, as the calendar uses: a Thu 7pm EST event is Fri
  // 00:00 UTC, so rendering in any other zone can name the wrong day. UTC when
  // the API omits it, so the two render paths agree regardless of host zone.
  const tz = item.timezone || 'UTC';

  const description = boundText(plainText(
    isEvent ? item.description : (item.content_html || item.content),
  ));

  const withRegions = fillRegions(template, {
    image: Boolean(image),
    event: isEvent,
    location: isEvent && Boolean(item.location),
    announcement: !isEvent,
  });

  return fillTokens(withRegions, {
    TITLE: esc(item.title || ''),
    DESCRIPTION: esc(description),
    CANONICAL_URL: esc(`${cfg.site}/${kind}/${item.id}/`),
    IMAGE_URL: esc(image || defaultImage(cfg)),
    EVENT_DATE: esc(formatDate(item.start_time, tz)),
    EVENT_TIME: esc(formatTime(item.start_time, tz)),
    EVENT_LOCATION: esc(item.location || ''),
    EVENT_DESCRIPTION: esc(item.description || 'No description available.'),
    PUBLISHED: esc(formatDate(item.published_at || item.created_at, 'UTC')),
    ANNOUNCEMENT_HTML: item.content_html || esc(item.content || 'No content available.'),
  });
}

// --- the web root --------------------------------------------------------

const pageDir = (cfg, kind, id) => path.join(cfg.root, kind, id);

function writeFileAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

function writePage(cfg, kind, id, html) {
  writeFileAtomic(path.join(pageDir(cfg, kind, id), 'index.html'), html);
}

/** The already-generated page, or null. Callers validate the id first. */
function readPage(cfg, kind, id) {
  try {
    return fs.readFileSync(path.join(pageDir(cfg, kind, id), 'index.html'), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Remove one generated page directory. Deletion NEVER reaches outside the two
 * generated prefixes: the kind and the id are re-validated here and the
 * resolved path is checked against its prefix, so a manifest key that is not a
 * page this tool created removes nothing.
 */
function removePage(cfg, kind, id) {
  if (kind !== 'e' && kind !== 'a') return false;
  if (!validId(id)) return false;
  const dir = path.resolve(pageDir(cfg, kind, id));
  const prefix = path.resolve(path.join(cfg.root, kind)) + path.sep;
  if (!dir.startsWith(prefix)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// --- the manifest --------------------------------------------------------
//
// `{ "<kind>/<id>": "<item date ISO>" }` — the record that lets reconcile tell
// "retracted" (in the window, gone from the payload) from "out of scope" (never
// asked about). It is also how a page written by the responder becomes known to
// the refresher: without an entry the next reconcile cannot reason about it.
//
// ponytail: last-writer-wins between the responder and the timer. Writes are a
// single rename and the timer runs minutes apart, so the race is theoretical;
// add a lockfile if the responder ever sees real concurrency.

const manifestKey = (kind, id) => `${kind}/${id}`;

function loadManifest(cfg) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cfg.manifest, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Absent or unreadable: start empty. Nothing is deleted on the strength of
    // an empty manifest, so a lost file costs pages their reconcile, not their
    // existence.
    return {};
  }
}

const saveManifest = (cfg, manifest) =>
  writeFileAtomic(cfg.manifest, `${JSON.stringify(manifest, null, 2)}\n`);

function writeSitemap(cfg, manifest) {
  const urls = Object.keys(manifest)
    .sort()
    .map((key) => `  <url><loc>${esc(`${cfg.site}/${key}/`)}</loc></url>`)
    .join('\n');
  writeFileAtomic(
    sitemapPath(cfg),
    `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}${urls ? '\n' : ''}</urlset>\n`,
  );
}

// --- the public API ------------------------------------------------------

async function fetchJsonArray(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const body = await response.json(); // throws on an unparseable body
  if (!Array.isArray(body)) throw new Error(`expected a JSON array from ${url}`);
  return body;
}

/**
 * Both payloads, or an exception. Nothing downstream touches the web root until
 * this resolves — the same rule yt-feed-refresh.sh follows with its `<entry>`
 * sanity check: a transient API failure keeps the last good copy rather than
 * degrading the site.
 */
async function fetchPublicItems(cfg, now = new Date()) {
  const { from, to } = pollWindow(now);
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const [events, announcements] = await Promise.all([
    fetchJsonArray(`${cfg.api}/public/events?${query}`),
    // No range parameters on this endpoint; the limit is generous and scope is
    // decided by item date below, exactly as it is for events.
    fetchJsonArray(`${cfg.api}/public/announcements?limit=200`),
  ]);
  return {
    from,
    to,
    // Members-only entries arrive already sanitized, so this filter is a
    // tidiness measure rather than the thing standing between the public web
    // and private content.
    events: events.filter((e) => e.visibility === 'Public'),
    announcements,
  };
}

const itemDate = (kind, item) =>
  kind === 'e' ? item.start_time : (item.published_at || item.created_at);

// --- reconcile -----------------------------------------------------------

/**
 * Bring the generated pages into agreement with the public API.
 *
 * Removal is decided ONLY for items the query covered. An item dated outside
 * the window is absent because it was never asked about, and deleting on that
 * basis would wipe every page older than the window on the first run. Age
 * governs polling; retraction is the only cause for removal.
 */
async function reconcile(cfg, now = new Date()) {
  const template = fs.readFileSync(templatePath(cfg), 'utf8');
  const { events, announcements, from, to } = await fetchPublicItems(cfg, now);

  const manifest = loadManifest(cfg);
  const live = [
    ...events.map((item) => ['e', item]),
    ...announcements.map((item) => ['a', item]),
  ];

  const written = [];
  for (const [kind, item] of live) {
    const id = String(item.id ?? '');
    if (!validId(id)) continue; // never let a malformed id reach a path
    writePage(cfg, kind, id, renderPage(template, kind, item, cfg));
    manifest[manifestKey(kind, id)] = itemDate(kind, item);
    written.push(manifestKey(kind, id));
  }

  const alive = new Set(written);
  const removed = [];
  for (const key of Object.keys(manifest)) {
    if (alive.has(key)) continue;
    const dated = Date.parse(manifest[key]);
    const inScope = Number.isFinite(dated) && dated >= from.getTime() && dated <= to.getTime();
    if (!inScope) continue; // out of the queried window: not evidence of anything
    const [kind, id] = key.split('/');
    if (removePage(cfg, kind, id)) removed.push(key);
    delete manifest[key];
  }

  saveManifest(cfg, manifest);
  writeSitemap(cfg, manifest);
  return { written, removed };
}

// --- on-request generation -----------------------------------------------

/**
 * Resolve one id against the public API. Returns null for anything that is not
 * a currently public item — which is what stops the on-request path from
 * resurrecting a retracted page.
 */
async function findPublicItem(cfg, kind, id, now = new Date()) {
  const { events, announcements } = await fetchPublicItems(cfg, now);
  const pool = kind === 'e' ? events : announcements;
  return pool.find((item) => String(item.id ?? '') === id) || null;
}

/**
 * Generate and persist one page, or null when the id does not resolve to a
 * public item. No retry, no negative cache, no placeholder file: a placeholder
 * would be indistinguishable from a real page to the reconciler.
 */
async function generatePage(cfg, kind, id, now = new Date()) {
  if (!validId(id)) return null;
  const item = await findPublicItem(cfg, kind, id, now);
  if (!item) return null;
  const html = renderPage(fs.readFileSync(templatePath(cfg), 'utf8'), kind, item, cfg);
  writePage(cfg, kind, id, html);
  const manifest = loadManifest(cfg);
  manifest[manifestKey(kind, id)] = itemDate(kind, item);
  saveManifest(cfg, manifest);
  writeSitemap(cfg, manifest);
  return html;
}

const SHARE_PATH = /^\/(e|a)\/([^/]+)\/?$/;

/**
 * The loopback responder. Caddy serves the generated file when it exists and
 * falls through here when it does not, for the two share prefixes only — stock
 * Caddy has no CGI or exec, so a reverse_proxy target is what needs no plugin
 * and no rebuild.
 */
function createResponder(cfg) {
  return http.createServer((req, res) => {
    const notFound = () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
      res.end('Not found\n');
    };

    let kind;
    let id;
    try {
      const match = SHARE_PATH.exec(new URL(req.url, 'http://127.0.0.1').pathname);
      if (!match) return notFound();
      kind = match[1];
      // Decode first, then validate: `%2e%2e` is `..`, and rejecting after the
      // decode is the only order that sees what the filesystem would.
      id = decodeURIComponent(match[2]);
    } catch {
      return notFound(); // malformed percent-encoding
    }
    if (!validId(id)) return notFound();

    const ok = (html) => {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
        etag: `"${crypto.createHash('sha256').update(html).digest('hex').slice(0, 32)}"`,
      });
      res.end(html);
    };

    // Caddy serves the written file before it ever reaches here, but a page
    // that already exists is still served rather than regenerated: generating
    // twice would put an outbound API call behind every request that slipped
    // past, which is a load amplifier pointed at Coterie.
    const written = readPage(cfg, kind, id);
    if (written) return ok(written);

    generatePage(cfg, kind, id)
      .then((html) => (html ? ok(html) : notFound()))
      .catch((err) => {
        console.error(`share-pages: ${kind}/${id}: ${err.message}`);
        notFound();
      });
  });
}

// --- CLI -----------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
  const cfg = loadConfig();
  const command = argv[0];

  if (command === 'refresh') {
    const { written, removed } = await reconcile(cfg);
    console.log(`share-pages: ${written.length} page(s) current, ${removed.length} removed`);
    if (removed.length) console.log(`share-pages: removed ${removed.join(', ')}`);
    return;
  }

  if (command === 'serve') {
    createResponder(cfg).listen(cfg.port, '127.0.0.1', () => {
      console.log(`share-pages: responder on 127.0.0.1:${cfg.port}`);
    });
    return;
  }

  console.error('usage: share-pages.js refresh | serve');
  process.exitCode = 2;
}

if (require.main === module) {
  main().catch((err) => {
    // Reaching here means the fetch or the template read failed, which happens
    // before anything in the web root is touched: nothing was changed.
    console.error(`share-pages: ${err.message}; changed nothing`);
    process.exitCode = 1;
  });
}

module.exports = {
  loadConfig,
  templatePath,
  sitemapPath,
  defaultImage,
  pollWindow,
  esc,
  absoluteImageUrl,
  plainText,
  boundText,
  validId,
  renderPage,
  writePage,
  readPage,
  removePage,
  loadManifest,
  saveManifest,
  writeSitemap,
  fetchPublicItems,
  reconcile,
  findPublicItem,
  generatePage,
  createResponder,
  main,
  WINDOW_PAST_DAYS,
  WINDOW_FUTURE_DAYS,
};
