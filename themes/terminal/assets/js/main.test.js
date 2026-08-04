/**
 * Regression tests for the API-sourced output-encoding fixes in main.js:
 *   - image_url interpolated into src/href HTML attributes (escapeAttr), and
 *   - event/announcement ids interpolated into inline onclick handlers
 *     (escapeJsAttr — a JS-string-inside-an-HTML-attribute context).
 *
 * main.js is a browser script: it registers DOMContentLoaded / alpine:init
 * listeners and defines its rendering helpers as top-level functions. As in
 * calendar.test.js we load it in a vm sandbox with minimal `document` / `window`
 * stubs — no browser, no Alpine, no extra dependencies — and exercise the
 * rendering functions directly.
 *
 * Node has no DOM, so rather than parse the rendered fragment we assert the
 * structural property that defines neutralization: the attacker-controlled
 * `image_url` is encoded such that it cannot terminate the `src`/`href`
 * attribute or open a new tag. Concretely, a correct render of one image card
 * contains exactly one `<img` token (the legitimate thumbnail); a vulnerable
 * render would contain a second one from the injected `<img ... onerror=...>`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// baseof.html loads calendar.js before main.js on every page, so calendar.js's
// top-level helpers — `eventDayKey`, which main.js's link builder calls — are
// browser globals by the time anything in main.js runs. Mirror that here rather
// than stubbing a second copy: calendar.js otherwise only registers an
// alpine:init listener, which the stubbed document never fires.
function runScripts(sandbox) {
  vm.createContext(sandbox);
  for (const file of ['calendar.js', 'main.js']) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

function loadMain() {
  // escapeHtml() does `div.textContent = str; return div.innerHTML`. Emulate a
  // browser element whose innerHTML reflects the HTML-escaped text content
  // (browsers escape &, <, > there — but not quotes, which is exactly why the
  // attribute-safe escapeAttr exists).
  const createElement = () => {
    let html = '';
    return {
      set textContent(value) {
        html = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      get innerHTML() {
        return html;
      },
    };
  };

  const sandbox = {
    document: {
      addEventListener() {},
      createElement,
    },
    // main.js assigns window.contentStore at load and reads window.COTERIE_API_URL
    // inside getImageUrl; an empty object is enough for both.
    window: {},
    console,
    // A vm context carries only the ECMAScript built-ins, so the WHATWG URL
    // parser safeRegistrationUrl relies on has to be handed in explicitly;
    // without it every parse would throw and fail closed, hiding real bugs.
    URL,
  };

  return runScripts(sandbox);
}

// The value between the first `src="` and the next `"`. Because escapeAttr
// encodes `"` to `&quot;`, the closing quote of a correctly-escaped attribute
// is the real attribute boundary.
function srcAttrValue(html) {
  const m = html.match(/src="([^"]*)"/);
  return m ? m[1] : null;
}

const BREAKOUT_URL = 'https://x"><img src=y onerror=window.__xss=1>';

test('image_url_with_attribute_breakout_is_neutralized', () => {
  const sandbox = loadMain();
  const html = sandbox.renderEventCard({
    id: 42,
    title: 'CTF Night',
    start_time: '2026-06-20T19:30:00Z',
    image_url: BREAKOUT_URL,
  });

  // Exactly one <img — the legitimate thumbnail. The payload's `<img` must have
  // been encoded to `&lt;img`, so no injected element is created.
  assert.equal(
    (html.match(/<img/g) || []).length,
    1,
    'attacker <img> tag must not survive as real markup'
  );

  // The whole payload survives only as entity-encoded, inert text — the quote
  // and angle brackets that would have terminated the src and opened a new tag
  // are encoded.
  assert.ok(html.includes('&lt;img src=y onerror=window.__xss=1&gt;'), 'payload is inert text');

  // The src attribute value carries no character that could break out.
  const src = srcAttrValue(html);
  assert.ok(src !== null, 'an <img src="..."> is present');
  assert.ok(!/[<>"]/.test(src), 'src value contains no raw <, >, or " to break out');

  // Nothing derived from the image_url executed.
  assert.equal(sandbox.window.__xss, undefined, 'no injected script executed');
});

test('image_url_normal_value_still_renders', () => {
  const sandbox = loadMain();
  const html = sandbox.renderEventCard({
    id: 7,
    title: 'Photo Night',
    start_time: '2026-06-20T19:30:00Z',
    image_url: 'https://example.com/a.jpg',
  });

  assert.ok(
    html.includes('src="https://example.com/a.jpg"'),
    'a plain URL passes through escapeAttr unchanged and renders as the src'
  );
  assert.equal(srcAttrValue(html), 'https://example.com/a.jpg');
});

test('escapeAttr encodes every attribute-significant character', () => {
  const sandbox = loadMain();
  assert.equal(sandbox.escapeAttr('& < > " \''), '&amp; &lt; &gt; &quot; &#39;');
  assert.equal(sandbox.escapeAttr(''), '');
  assert.equal(sandbox.escapeAttr(null), '');
  assert.equal(sandbox.escapeAttr(undefined), '');
});

// --- onclick id escaping (escapeJsAttr) -------------------------------------
//
// The five `onclick="showXModal('${id}')"` sites embed an API-sourced id in a
// single-quoted JS string that itself lives inside a double-quoted HTML
// attribute. The id is also the contentStore lookup key, so the encoding must
// (a) prevent breakout and (b) round-trip the value exactly. escapeAttr alone
// is NOT enough here: it entity-encodes `'` to `&#39;`, which the HTML parser
// decodes back to `'` before the JS engine runs — reopening the breakout.

// Value of the onclick="..." attribute. escapeJsAttr encodes `"` to &quot;, so
// the next literal double-quote is the true attribute boundary.
function onclickAttrValue(html) {
  const m = html.match(/onclick="([^"]*)"/);
  return m ? m[1] : null;
}

// Decode the entities a browser decodes in an attribute value before handing the
// result to the JS engine. Decode &amp; last so we don't double-decode.
function htmlDecode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Reproduce the full browser pipeline for an inline handler: extract the onclick
// source, HTML-decode it (HTML parser), then execute it (JS engine) in a sandbox
// whose showXModal stubs record their argument. A correctly-encoded id results
// in exactly one call with the original id and no injected side effect.
function runInlineHandler(html) {
  const onclick = onclickAttrValue(html);
  assert.ok(onclick !== null, 'an onclick="..." handler is present');
  const calls = [];
  const ctx = {
    showEventModal: (a) => calls.push(a),
    showAnnouncementModal: (a) => calls.push(a),
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(htmlDecode(onclick), ctx, { filename: 'onclick-handler' });
  return { calls, window: ctx.window };
}

const ONCLICK_BREAKOUT_ID = "1');window.__xss=1;//";

test('onclick_id_with_quote_breakout_is_neutralized', () => {
  const sandbox = loadMain();
  const html = sandbox.renderEventCard({
    id: ONCLICK_BREAKOUT_ID,
    title: 'CTF Night',
    start_time: '2026-06-20T19:30:00Z',
  });

  // Run the handler exactly as a browser would (HTML-decode, then execute).
  const { calls, window } = runInlineHandler(html);

  // The injected `;window.__xss=1` never executed: it stayed inside the JS
  // string literal because the apostrophe was JS-escaped (\') and survived
  // HTML decoding as an escaped quote.
  assert.equal(window.__xss, undefined, 'no injected statement executed from the id');
  // The handler fired once with the original id intact (so the contentStore
  // lookup still works).
  assert.deepEqual(calls, [ONCLICK_BREAKOUT_ID], 'handler called once with the exact id');
});

test('onclick_id_normal_value_round_trips', () => {
  const sandbox = loadMain();
  const html = sandbox.renderAnnouncementCard({
    id: 'abc-123',
    title: 'Hello',
    published_at: '2026-06-20T19:30:00Z',
  });

  assert.ok(
    html.includes(`onclick="showAnnouncementModal('abc-123')"`),
    'a plain id passes through escapeJsAttr unchanged'
  );
  const { calls, window } = runInlineHandler(html);
  assert.equal(window.__xss, undefined);
  assert.deepEqual(calls, ['abc-123'], 'handler called once with the exact id');
});

test('escapeJsAttr neutralizes breakout while preserving the value', () => {
  const { escapeJsAttr } = loadMain();

  // Apostrophe is JS-escaped (survives HTML decoding as an escaped quote), NOT
  // entity-encoded — entity-encoding would decode back to ' and reopen the hole.
  assert.equal(escapeJsAttr("a'b"), "a\\'b");
  // Backslash is doubled so it cannot escape our escaping.
  assert.equal(escapeJsAttr('a\\b'), 'a\\\\b');
  // Attribute-breaking / HTML-significant characters are entity-encoded.
  assert.equal(escapeJsAttr('&'), '&amp;');
  assert.equal(escapeJsAttr('"'), '&quot;');
  assert.equal(escapeJsAttr('<'), '&lt;');
  assert.equal(escapeJsAttr('>'), '&gt;');
  // Raw line terminators (illegal inside a JS string literal) are escaped.
  assert.equal(escapeJsAttr('a\nb'), 'a\\nb');
  assert.equal(escapeJsAttr('a\rb'), 'a\\rb');
  // Falsy / nullish input yields the empty string; numeric ids stringify.
  assert.equal(escapeJsAttr(''), '');
  assert.equal(escapeJsAttr(null), '');
  assert.equal(escapeJsAttr(undefined), '');
  assert.equal(escapeJsAttr(42), '42');
});

// --- image_url in a CSS url() context (renderFeaturedBanner) -----------------
//
// renderFeaturedBanner is the one site that inserts an image_url into a CSS
// `background-image: url("...")` value. HTML-entity encoding is NOT decoded
// inside a CSS url(), so escapeAttr would be useless here; instead the code
// DROPS the URL entirely when it contains any character that could break out of
// url("...") — quotes, parentheses, backslashes, or whitespace — and otherwise
// wraps it as url("<url>"). The src/href (escapeAttr) and onclick (escapeJsAttr)
// contexts are covered above; this covers the third context the canon names,
// "inline `style` `url(...)`".
//
// renderFeaturedBanner is reached through initAnnouncementBanner, so we drive it
// end-to-end: load main.js in a sandbox whose CoterieAPI.getAnnouncements yields
// a single featured announcement (one item avoids starting the rotation timer),
// then await initAnnouncementBanner() and inspect the fake banner's style.
function loadMainBanner(announcements) {
  // Same innerHTML/textContent emulation as loadMain, for document.createElement
  // (escapeHtml) used while rendering the banner's text content.
  const createElement = () => {
    let html = '';
    return {
      set textContent(value) {
        html = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      get innerHTML() {
        return html;
      },
    };
  };

  // Fake #announcement-banner element: a mutable `style` object, no-op classList
  // add/remove, an innerHTML setter/getter, a settable className, and a no-op
  // addEventListener.
  let bannerHtml = '';
  const banner = {
    style: {},
    className: '',
    classList: { add() {}, remove() {} },
    set innerHTML(value) {
      bannerHtml = String(value);
    },
    get innerHTML() {
      return bannerHtml;
    },
    addEventListener() {},
  };

  const sandbox = {
    document: {
      addEventListener() {},
      createElement,
      getElementById(id) {
        return id === 'announcement-banner' ? banner : null;
      },
    },
    window: {},
    console,
    // main.js calls the bare global CoterieAPI.getAnnouncements (defined in
    // api.js, which we don't load); stub it to yield the supplied announcements.
    CoterieAPI: {
      getAnnouncements: async () => announcements,
    },
    // One featured item won't start rotation, but stub these so any code path is
    // inert in the sandbox.
    setInterval() {},
    clearInterval() {},
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'main.js' });
  sandbox.banner = banner;
  return sandbox;
}

test('featured_banner_drops_image_url_with_css_breakout', async () => {
  const sandbox = loadMainBanner([
    {
      id: 'feat-1',
      title: 'Featured',
      featured: true,
      // Contains ", ), and whitespace — any one of which could break out of
      // url("..."), so the whole value must be dropped.
      image_url: 'https://x") ; background:url(evil) "',
    },
  ]);

  await sandbox.initAnnouncementBanner();

  // The URL was dropped, so no attacker-controlled value reaches the rendered
  // banner's CSS: background-image is empty.
  assert.equal(
    sandbox.banner.style.backgroundImage,
    '',
    'a CSS url() breakout payload must be dropped, leaving an empty background-image'
  );
});

test('featured_banner_renders_well_formed_image_url', async () => {
  const sandbox = loadMainBanner([
    {
      id: 'feat-2',
      title: 'Featured',
      featured: true,
      image_url: 'https://cdn.example.com/a.jpg',
    },
  ]);

  await sandbox.initAnnouncementBanner();

  // A clean URL (no url()-significant characters) is wrapped as url("<url>").
  assert.equal(
    sandbox.banner.style.backgroundImage,
    'url("https://cdn.example.com/a.jpg")'
  );
});

// --- image-path resolution (getImageUrl) -------------------------------------
//
// getImageUrl resolves an API-supplied image path to the URL every event /
// announcement image renders from. It branches three ways: a falsy path → '';
// a value already starting with http://|https:// → returned unchanged; any
// other (relative) path → joined to the configured API base URL
// (window.COTERIE_API_URL, or '' when unset) with a single '/'. The encoding
// tests above only exercise the absolute-URL branch indirectly; these assert
// the resolution invariant directly. getImageUrl is a top-level function in
// main.js, so loadMain() exposes it on the sandbox like the other render
// helpers, and it reads window.COTERIE_API_URL at call time (not load time).

test('getImageUrl_returns_absolute_url_unchanged', () => {
  const { getImageUrl } = loadMain();

  // Both schemes pass through verbatim — the base URL is never prepended.
  assert.equal(getImageUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(getImageUrl('http://cdn.example.com/a.jpg'), 'http://cdn.example.com/a.jpg');
});

test('getImageUrl_joins_relative_path_to_configured_base', () => {
  const sandbox = loadMain();
  // getImageUrl reads window.COTERIE_API_URL at call time, so setting it on the
  // sandbox after load is enough.
  sandbox.window.COTERIE_API_URL = 'https://api.test';

  assert.equal(sandbox.getImageUrl('uploads/a.jpg'), 'https://api.test/uploads/a.jpg');
});

test('getImageUrl_roots_relative_path_when_base_unset', () => {
  const { getImageUrl } = loadMain();
  // No window.COTERIE_API_URL on the sandbox → base is '', so the path is
  // rooted at the single joining '/'.
  assert.equal(getImageUrl('uploads/a.jpg'), '/uploads/a.jpg');
});

test('getImageUrl_returns_empty_string_for_falsy_input', () => {
  const { getImageUrl } = loadMain();

  assert.equal(getImageUrl(''), '');
  assert.equal(getImageUrl(null), '');
});

// --- announcement modal content_html rendering (showAnnouncementModal) -------
//
// The full-body modal is the ONE place the announcement `content_html` (Coterie
// server-sanitized HTML) is inserted via innerHTML. Every other field —
// including the raw `content` and `title` — stays untrusted and is inserted as
// text. Card/list previews never use content_html (truncating sanitized HTML
// could cut a tag). As above we drive main.js in a vm sandbox: getElementById
// returns fake modal elements whose textContent setter HTML-escapes (like a
// browser) while innerHTML stores raw, so a raw `<strong>` in innerHTML means
// the value was rendered as markup, and `&lt;script&gt;` means it was escaped.
function loadMainWithModal() {
  const makeEl = () => {
    let html = '';
    return {
      set textContent(value) {
        html = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      set innerHTML(value) {
        html = String(value);
      },
      get innerHTML() {
        return html;
      },
      classList: { add() {}, remove() {} },
      style: {},
    };
  };

  // A button reads its own label back before flashing "Copied!", so unlike the
  // modal panes this stub needs a textContent getter as well as a setter.
  const makeButton = () => {
    let text = '';
    return {
      set textContent(value) {
        text = String(value);
      },
      get textContent() {
        return text;
      },
    };
  };

  const els = {
    'modal-image-container': makeEl(),
    'modal-title': makeEl(),
    'modal-meta': makeEl(),
    'modal-content': makeEl(),
    'detail-modal': makeEl(),
    'modal-copy-link': makeButton(),
  };

  // A mutable stand-in for window.location. history.replaceState resolves what
  // it is handed against the current href and writes the parts back, so the
  // deep-link assertions read the same pathname/search/hash a browser would.
  const location = {};
  const navigate = (url) => {
    const next = new URL(url, location.href || 'https://neontemple.net/calendar/');
    Object.assign(location, {
      href: next.href,
      origin: next.origin,
      pathname: next.pathname,
      search: next.search,
      hash: next.hash,
    });
  };
  navigate('https://neontemple.net/calendar/');

  const copied = [];

  const sandbox = {
    document: {
      addEventListener() {},
      createElement: makeEl,
      getElementById: (id) => els[id] || null,
      body: { style: {} },
    },
    window: {},
    console,
    // Both modals reflect what is open in the URL, and clear it on close.
    location,
    history: { replaceState: (_state, _title, url) => navigate(url) },
    navigator: {
      clipboard: {
        writeText(value) {
          copied.push(value);
          return Promise.resolve();
        },
      },
    },
    setTimeout,
    URL,
  };

  runScripts(sandbox);
  sandbox.els = els;
  sandbox.copied = copied;
  return sandbox;
}

function loadMainModal(announcement) {
  const sandbox = loadMainWithModal();
  // main.js assigns window.contentStore at load; register the announcement there
  // (its lookup key) and open its modal.
  sandbox.window.contentStore.announcements[announcement.id] = announcement;
  sandbox.showAnnouncementModal(announcement.id);
  return sandbox;
}

test('announcement_modal_renders_content_html_as_formatted_html', () => {
  const sandbox = loadMainModal({
    id: 'a-1',
    title: 'News',
    content: 'hi there',
    content_html: '<p>hi <strong>there</strong></p>',
    published_at: '2026-06-20T19:30:00Z',
  });

  const body = sandbox.els['modal-content'].innerHTML;
  // Rendered as markup (a real <strong> element), not the escaped literal tag.
  assert.ok(body.includes('<strong>there</strong>'), 'content_html renders as markup');
  assert.ok(!body.includes('&lt;strong&gt;'), 'content_html is not inserted as escaped text');
});

test('announcement_title_and_raw_content_render_as_inert_text', () => {
  const XSS = '<script>alert(1)</script>';

  // Modal: the title is inserted as text even when content_html is present.
  const sandbox = loadMainModal({
    id: 'a-2',
    title: XSS,
    content: XSS,
    content_html: '<p>safe</p>',
    published_at: '2026-06-20T19:30:00Z',
  });
  const title = sandbox.els['modal-title'].innerHTML;
  assert.ok(!title.includes('<script>'), 'title is not live markup');
  assert.ok(title.includes('&lt;script&gt;'), 'title is escaped text');

  // Previews render content_html (inline-truncated); the title stays escaped
  // text, and raw `content` is never inserted as markup.
  const card = sandbox.renderAnnouncementCardFull({
    id: 'a-2',
    title: XSS,
    content: XSS,
    content_html: '<p><em>kept in previews</em></p>',
    published_at: '2026-06-20T19:30:00Z',
  });
  assert.ok(!card.includes('<script>'), 'card title/content is not live markup');
  assert.ok(card.includes('<em>kept in previews</em>'), 'card preview renders content_html inline tags');
  assert.ok(card.includes('&lt;script&gt;'), 'card renders script title as escaped text');

  // content_html absent (older API): preview falls back to escaped raw content.
  const fallback = sandbox.renderAnnouncementCardFull({
    id: 'a-2b',
    title: 'News',
    content: XSS,
    published_at: '2026-06-20T19:30:00Z',
  });
  assert.ok(!fallback.includes('<script>'), 'fallback preview is not live markup');
  assert.ok(fallback.includes('&lt;script&gt;'), 'fallback preview is escaped text');
});

// --- truncateHtml (inline preview truncation of sanitized content_html) ------

test('truncateHtml_cuts_by_visible_chars_and_closes_open_tags', () => {
  const { truncateHtml } = loadMain();

  // Short input passes through (minus dropped block wrapper), no ellipsis.
  assert.equal(truncateHtml('<p>hi <em>there</em></p>', 50), 'hi <em>there</em>');

  // Cut lands inside nested tags: both are closed, ellipsis inside.
  assert.equal(
    truncateHtml('<strong><em>abcdef</em></strong>', 3),
    '<strong><em>abc...</em></strong>',
  );

  // Entities count as one visible character and are never split.
  assert.equal(truncateHtml('&amp;&amp;&amp;', 2), '&amp;&amp;...');
});

test('truncateHtml_keeps_only_inline_tags', () => {
  const { truncateHtml } = loadMain();

  // Block structure is unwrapped to spaced text.
  const flat = truncateHtml('<p>one</p>\n<ul>\n<li>two</li>\n<li>three</li>\n</ul>\n', 100);
  assert.ok(!flat.includes('<'), 'no tags survive from block-only input');
  assert.equal(flat.replace(/\s+/g, ' '), 'one two three');

  // Links are unwrapped to their text (previews live inside an onclick card);
  // kept tags are re-emitted bare, so no attributes leak through.
  assert.equal(truncateHtml('see <a href="https://x.test">the <em class="x">docs</em></a>', 50), 'see the <em>docs</em>');

  // del survives — strikethrough jokes render in previews.
  assert.equal(truncateHtml('<p>Coterie <del>v1.0.10</del> v1.0.11</p>', 50), 'Coterie <del>v1.0.10</del> v1.0.11');
});

test('announcement_modal_falls_back_to_text_content_when_content_html_absent', () => {
  const sandbox = loadMainModal({
    id: 'a-3',
    title: 'News',
    content: 'plain <b>text</b> only',
    // content_html absent (older API) -> the modal renders `content` as text.
    published_at: '2026-06-20T19:30:00Z',
  });

  const body = sandbox.els['modal-content'].innerHTML;
  assert.ok(!body.includes('<b>'), 'no raw tags rendered on the text fallback');
  assert.ok(body.includes('plain &lt;b&gt;text&lt;/b&gt; only'), 'fallback renders content as escaped text');
});

// --- event registration affordance -------------------------------------------
//
// A registration affordance appears IFF the API sends a usable `registration_url`
// — the opt-in signal — and never because of a price, an rsvp flag, or a
// visibility. The value lands in an `href`, so it is scheme-validated first: a
// `javascript:` URL executes in the page's origin, which attribute escaping does
// not prevent. The card carries only an inert cost badge; the anchor lives in the
// modal, which is reused across events, so it must not outlive its own event.

// Open an event's modal in a fresh-enough sandbox: register it in contentStore
// (the lookup key) and read back what modal-meta rendered.
function openEventModal(sandbox, event) {
  sandbox.window.contentStore.events[event.id] = event;
  sandbox.showEventModal(event.id);
  return sandbox.els['modal-meta'].innerHTML;
}

const WEEKLY_EVENT = {
  id: 'ev-weekly',
  title: 'Thursday Talk',
  start_time: '2026-06-25T23:00:00Z',
  timezone: 'America/New_York',
};
const PAID_EVENT = {
  id: 'ev-paid',
  title: 'Soldering Workshop',
  start_time: '2026-07-11T14:00:00Z',
  timezone: 'America/New_York',
  guest_price_cents: 3000,
  registration_url: 'https://coterie.test/register/ev-paid',
};

test('safeRegistrationUrl accepts only absolute http(s) URLs', () => {
  const { safeRegistrationUrl } = loadMain();

  assert.equal(
    safeRegistrationUrl('https://coterie.test/register/1'),
    'https://coterie.test/register/1',
  );
  assert.equal(safeRegistrationUrl('http://coterie.test/r'), 'http://coterie.test/r');

  // Script-executing and other non-web schemes are rejected...
  assert.equal(safeRegistrationUrl('javascript:window.__xss=1'), null);
  assert.equal(safeRegistrationUrl('JavaScript:window.__xss=1'), null, 'scheme match is case-insensitive');
  assert.equal(safeRegistrationUrl(' javascript:window.__xss=1'), null, 'leading whitespace does not smuggle a scheme');
  assert.equal(safeRegistrationUrl('data:text/html,<script>1</script>'), null);
  // ...as is anything that is not an absolute URL at all.
  assert.equal(safeRegistrationUrl('/register/1'), null, 'relative path');
  assert.equal(safeRegistrationUrl('not a url'), null);
  assert.equal(safeRegistrationUrl(''), null);
  assert.equal(safeRegistrationUrl(null), null);
  assert.equal(safeRegistrationUrl(undefined), null, 'absent field is the common case');
});

test('event without a registration_url renders no badge and no button', () => {
  const sandbox = loadMainWithModal();

  // A price alone is not evidence the public may register — that call belongs to
  // the backend, and this is the field it makes it with.
  for (const event of [WEEKLY_EVENT, { ...WEEKLY_EVENT, guest_price_cents: 2500, rsvp_required: true }]) {
    const card = sandbox.renderEventCard(event);
    assert.ok(!card.includes('badge'), 'no badge element on a show-up event');
    assert.ok(!card.includes('Register'), 'no registration wording on a show-up event');

    const meta = openEventModal(sandbox, event);
    assert.ok(!meta.includes('<a'), 'no anchor in the modal for a show-up event');
    assert.ok(!meta.includes('Register'), 'no registration wording in the modal');
  }
});

test('javascript: registration_url renders no affordance and no anchor', () => {
  const sandbox = loadMainWithModal();
  const event = {
    ...PAID_EVENT,
    registration_url: 'javascript:window.__xss=1',
  };

  const card = sandbox.renderEventCard(event);
  assert.ok(!card.includes('badge'), 'a rejected URL renders no badge');
  assert.ok(!card.includes('javascript:'), 'the rejected value never reaches the markup');

  const meta = openEventModal(sandbox, event);
  assert.ok(!meta.includes('<a'), 'no anchor is inserted for a rejected URL');
  assert.ok(!meta.includes('javascript:'), 'the rejected value never reaches the DOM');

  // Relative URLs fail closed the same way — no broken link is rendered.
  const relative = openEventModal(sandbox, { ...PAID_EVENT, id: 'ev-rel', registration_url: '/register' });
  assert.ok(!relative.includes('<a'), 'a relative URL renders no anchor either');
});

test('registerable event shows the cost on the card and links from the modal', () => {
  const sandbox = loadMainWithModal();

  const card = sandbox.renderEventCard(PAID_EVENT);
  assert.ok(card.includes('class="badge badge-register"'), 'the card carries a cost badge');
  assert.ok(card.includes('Register — $30'), '3000 cents reads as $30');
  // The card stays a single click target: one onclick, no nested anchor.
  assert.equal((card.match(/onclick=/g) || []).length, 1, 'exactly one click target on the card');
  assert.ok(!card.includes('<a'), 'the badge is not itself a link');

  const meta = openEventModal(sandbox, PAID_EVENT);
  assert.ok(
    meta.includes('href="https://coterie.test/register/ev-paid"'),
    'the modal anchors to the validated registration URL',
  );
  assert.ok(meta.includes('rel="noopener"'), 'the new-tab link is opened without a window opener');
  assert.ok(meta.includes('Register — $30'), 'the button names the action and states the cost');
});

test('zero-price registerable event reads as free, not $0.00', () => {
  const sandbox = loadMainWithModal();
  const free = { ...PAID_EVENT, id: 'ev-free', guest_price_cents: 0 };

  const card = sandbox.renderEventCard(free);
  assert.ok(card.includes('Register — Free'), 'a zero price reads as Free');
  assert.ok(!card.includes('$0'), 'never renders a zero currency amount');

  const meta = openEventModal(sandbox, free);
  assert.ok(meta.includes('Register — Free'));
  assert.ok(!meta.includes('$0'));

  // guest_price_cents absent entirely (registration required, nothing to pay).
  const noPrice = sandbox.renderEventCard({ ...PAID_EVENT, id: 'ev-np', guest_price_cents: undefined });
  assert.ok(noPrice.includes('Register — Free'), 'a missing price reads as Free too');

  // Fractional dollars keep their cents.
  assert.ok(
    sandbox.renderEventCard({ ...PAID_EVENT, id: 'ev-frac', guest_price_cents: 1250 }).includes('Register — $12.50'),
  );
});

test('modal registration button does not survive into the next event', () => {
  const sandbox = loadMainWithModal();

  const paid = openEventModal(sandbox, PAID_EVENT);
  assert.ok(paid.includes('Register — $30'), 'the registerable event shows its button');

  // The modal is reused across events — the classic stale-control bug.
  const weekly = openEventModal(sandbox, WEEKLY_EVENT);
  assert.ok(!weekly.includes('Register'), 'no stale button on the next, non-registerable event');
  assert.ok(!weekly.includes('<a'), 'no stale anchor either');
});

// --- membership type option labels (join form) --------------------------------

test('formatMembershipOption_renders_fee_and_period_variants', () => {
  const { formatMembershipOption } = loadMain();

  assert.equal(
    formatMembershipOption({ name: 'Member', fee_cents: 4500, billing_period: 'monthly' }),
    'Member — $45/month',
    'whole-dollar monthly fee drops the cents',
  );
  assert.equal(
    formatMembershipOption({ name: 'Patron', fee_cents: 48000, billing_period: 'yearly' }),
    'Patron — $480/year',
  );
  assert.equal(
    formatMembershipOption({ name: 'Founder', fee_cents: 50000, billing_period: 'lifetime' }),
    'Founder — $500 lifetime',
  );
  assert.equal(
    formatMembershipOption({ name: 'Student', fee_cents: 1250, billing_period: 'monthly' }),
    'Student — $12.50/month',
    'non-whole fees keep two decimals',
  );
  assert.equal(
    formatMembershipOption({ name: 'Guest', fee_cents: 0, billing_period: 'monthly' }),
    'Guest — Free',
    'zero fee renders Free regardless of period',
  );
});

// --- signup captcha token (initSignupForm) -----------------------------------
//
// Cloudflare Turnstile injects a hidden `cf-turnstile-response` field into the
// form; initSignupForm must forward it to Coterie as `captcha_token`, omit it
// when the widget is unconfigured (field absent), and reset the single-use
// widget on a failed submit so a retry mints a fresh token. As above we drive
// main.js in a vm sandbox: a fake form captures its submit handler and yields
// `fields` through a stub FormData; CoterieAPI.signup records the payload (or
// throws to exercise the reset path).
function loadMainSignup(fields, signup) {
  const submitBtn = { textContent: 'Create Account', disabled: false };
  let submitHandler;
  const form = {
    innerHTML: '',
    addEventListener(type, handler) {
      if (type === 'submit') submitHandler = handler;
    },
    // No membership <select> -> populateMembershipTypes returns without an API
    // call; no pre-existing .form-error.
    querySelector: (sel) => (sel === 'button[type="submit"]' ? submitBtn : null),
    insertBefore() {},
  };

  const turnstile = { resetCount: 0, reset() { this.resetCount += 1; } };

  const sandbox = {
    document: {
      addEventListener() {},
      getElementById: (id) => (id === 'signup-form' ? form : null),
      createElement: () => ({ className: '', textContent: '' }),
    },
    // `new FormData(form)` -> the form's fields as an array of [k, v] entries,
    // which Object.fromEntries consumes exactly like a real FormData.
    FormData: function () { return Object.entries(fields); },
    CoterieAPI: { signup, getMembershipTypes: async () => [] },
    window: { turnstile, COTERIE_PORTAL_URL: 'https://portal.test' },
    console,
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'main.js' });
  sandbox.initSignupForm();
  return { submit: () => submitHandler({ preventDefault() {} }), turnstile };
}

const SIGNUP_FIELDS = {
  email: 'a@b.co', username: 'neo', full_name: 'The One', password: 'x'.repeat(10),
};

test('initSignupForm forwards cf-turnstile-response as captcha_token', async () => {
  let sent;
  const { submit } = loadMainSignup(
    { ...SIGNUP_FIELDS, 'cf-turnstile-response': 'TOKEN123' },
    async (data) => { sent = data; return {}; },
  );
  await submit();
  assert.equal(sent.captcha_token, 'TOKEN123', 'widget response is sent as captcha_token');
  assert.ok(!('cf-turnstile-response' in sent), 'raw turnstile field is not forwarded');
});

test('initSignupForm omits captcha_token when the widget is unconfigured', async () => {
  let sent;
  const { submit } = loadMainSignup(
    { ...SIGNUP_FIELDS },
    async (data) => { sent = data; return {}; },
  );
  await submit();
  assert.ok(!('captcha_token' in sent), 'no captcha_token when there is no widget response');
});

test('initSignupForm resets the single-use widget after a failed submit', async () => {
  const { submit, turnstile } = loadMainSignup(
    { ...SIGNUP_FIELDS, 'cf-turnstile-response': 'TOKEN123' },
    async () => { throw new Error('bot challenge failed'); },
  );
  await submit();
  assert.equal(turnstile.resetCount, 1, 'a failed submit resets the widget so a retry gets a fresh token');
});

// --- password length hint (initPasswordLengthHint) ---------------------------
//
// Coterie's ceiling is 128 UTF-8 bytes, so the warning has to count bytes — and
// it is advisory: it may not touch the value the visitor typed. The field
// carries no maxlength (build.test.js guards that), which is precisely why an
// over-length password has to reach the field intact and be told about here.
const BOUNDS_TEXT = '10 characters minimum, 128 bytes maximum.';

function loadMainPasswordHint() {
  const input = { value: '', addEventListener(type, h) { if (type === 'input') this.oninput = h; } };
  const hint = { textContent: BOUNDS_TEXT, style: { color: 'var(--text-secondary)' } };
  const form = {
    addEventListener() {},
    querySelector: (sel) => ({ '#password': input, '#password-hint': hint }[sel] || null),
  };

  const sandbox = {
    document: { addEventListener() {}, getElementById: (id) => (id === 'signup-form' ? form : null) },
    window: {},
    console,
    // A vm context carries only the ECMAScript built-ins; TextEncoder is a
    // platform global and has to be handed in, like URL above.
    TextEncoder,
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'main.js' });
  sandbox.initSignupForm();

  return {
    type: (value) => { input.value = value; input.oninput(); },
    input,
    hint,
  };
}

test('over-length password warns without touching the value', () => {
  const { type, input, hint } = loadMainPasswordHint();

  const pasted = 'x'.repeat(200);
  type(pasted);

  assert.equal(input.value, pasted, 'all 200 characters stay in the field — nothing clips them');
  assert.match(hint.textContent, /Too long: 200 bytes/, 'the warning reports the measured size and the limit');
  assert.equal(hint.style.color, 'var(--warning)');
});

test('password warning counts UTF-8 bytes, not characters', () => {
  const { type, hint } = loadMainPasswordHint();

  // 40 emoji: 40 UTF-16 code units' worth of "length" per pair — 160 bytes.
  // Anything counting characters would call this fine.
  type('🔒'.repeat(40));
  assert.match(hint.textContent, /Too long: 160 bytes/, 'multi-byte characters count for their byte size');

  // 128 ASCII characters is exactly the ceiling: at the limit, not over it.
  type('x'.repeat(128));
  assert.equal(hint.textContent, BOUNDS_TEXT, 'a password at the ceiling is not warned about');
  assert.equal(hint.style.color, 'var(--text-secondary)', 'and the hint returns to its normal styling');
});

// --- event deep links --------------------------------------------------------
//
// An open event modal reflects itself in the URL as
// /calendar/?m=<YYYY-MM>#event-<id> and offers a control that copies it. The
// month is what makes such a link resolvable at all — the calendar fetches one
// month at a time and the public API has no single-event lookup — so it must
// name the event's OWN month, not the viewer's.

const LINKED_EVENT = {
  id: 'ev-42',
  title: 'CTF Night',
  start_time: '2026-09-12T18:00:00Z',
  timezone: 'UTC',
};

test('event link names the month in the event\'s own timezone', () => {
  const { eventLinkUrl } = loadMainWithModal();

  // 2026-11-01T00:00Z is Sat Oct 31, 8pm in New York (still EDT — DST ends the
  // next morning). It is November in UTC and in every zone east of Eastern, so
  // deriving the month from the instant, or from the month on screen, would
  // build a link that resolves to the wrong month. It must say October.
  assert.equal(
    eventLinkUrl({ id: 'ev-halloween', start_time: '2026-11-01T00:00:00Z', timezone: 'America/New_York' }),
    'https://neontemple.net/calendar/?m=2026-10#event-ev-halloween',
    'the boundary event links to its own month',
  );

  // An unremarkable mid-month event is unaffected by the same derivation.
  assert.equal(
    eventLinkUrl(LINKED_EVENT),
    'https://neontemple.net/calendar/?m=2026-09#event-ev-42',
  );

  // Degraded inputs: no id means no anchor and so no link at all; an
  // unparseable start time drops the month hint but keeps a usable fragment.
  assert.equal(eventLinkUrl({ start_time: '2026-09-12T18:00:00Z' }), null, 'no id, no link');
  assert.equal(
    eventLinkUrl({ id: 'ev-bad', start_time: 'not-a-date' }),
    'https://neontemple.net/calendar/#event-ev-bad',
  );
});

test('opening an event modal writes its link and closing clears it', () => {
  const sandbox = loadMainWithModal();
  sandbox.window.contentStore.events[LINKED_EVENT.id] = LINKED_EVENT;

  sandbox.showEventModal(LINKED_EVENT.id);

  assert.equal(sandbox.location.pathname, '/calendar/');
  assert.equal(sandbox.location.search, '?m=2026-09', 'the URL carries the event\'s month');
  assert.equal(sandbox.location.hash, '#event-ev-42', 'and the event fragment');

  // The copy control puts the absolute URL on the clipboard, so a pasted value
  // works off-site.
  const btn = sandbox.els['modal-copy-link'];
  assert.equal(typeof btn.onclick, 'function', 'the modal binds a copy handler');
  btn.onclick();
  assert.deepEqual(sandbox.copied, ['https://neontemple.net/calendar/?m=2026-09#event-ev-42']);
  assert.ok(sandbox.els['modal-meta'].innerHTML.includes('Copy link'), 'the button is rendered in modal-meta');

  sandbox.closeModal();

  assert.equal(sandbox.location.hash, '', 'closing drops the fragment');
  assert.equal(sandbox.location.search, '', 'and the month parameter');
  assert.equal(sandbox.location.pathname, '/calendar/', 'leaving the calendar page itself');
});

test('an event id with URL-significant characters round-trips and never reaches markup raw', () => {
  const ODD_ID = 'a b/c?d#e&f"<g>';
  const sandbox = loadMainWithModal();
  const event = { ...LINKED_EVENT, id: ODD_ID };
  sandbox.window.contentStore.events[ODD_ID] = event;

  sandbox.showEventModal(ODD_ID);

  // The `?` and `#` must be encoded or they would be read as a new query /
  // fragment boundary, and the round trip is what the reader relies on.
  assert.equal(sandbox.location.search, '?m=2026-09', 'the id\'s ? did not start a query');
  const fragment = sandbox.location.hash.match(/^#event-(.+)$/);
  assert.ok(fragment, 'an #event- fragment is present');
  assert.equal(decodeURIComponent(fragment[1]), ODD_ID, 'the id survives the round trip');

  // The id is an API value: it must not appear in the modal's markup as-is, and
  // the copy handler is a closure rather than an interpolated onclick — that
  // attribute is decoded twice (HTML, then JS).
  const meta = sandbox.els['modal-meta'].innerHTML;
  assert.ok(!meta.includes(ODD_ID), 'the raw id is not interpolated into the modal markup');
  assert.ok(!meta.includes('<g>'), 'no tag from the id survives as markup');
  assert.ok(!/onclick/i.test(meta), 'the copy button carries no inline handler');

  // The copied link still carries the encoded id.
  sandbox.els['modal-copy-link'].onclick();
  assert.equal(sandbox.copied[0], `https://neontemple.net/calendar/?m=2026-09#event-${encodeURIComponent(ODD_ID)}`);
});

test('announcement deep links still open, copy, and clear', () => {
  const sandbox = loadMainWithModal();
  const announcement = {
    id: 'a-7',
    title: 'Doors Open Late',
    content: 'plain text',
    published_at: '2026-06-20T19:30:00Z',
  };
  sandbox.window.contentStore.announcements[announcement.id] = announcement;

  sandbox.showAnnouncementModal(announcement.id);
  assert.equal(sandbox.location.hash, '#announcement-a-7', 'the announcement anchor is written');

  // Reading it back from the URL opens the same modal — the pasted-link path.
  sandbox.els['modal-title'].textContent = '';
  sandbox.openAnnouncementFromHash();
  assert.ok(sandbox.els['modal-title'].innerHTML.includes('Doors Open Late'), 'the fragment re-opens it');

  // Copy still yields the announcements-page form, even from another page.
  const btn = { textContent: 'Copy link' };
  sandbox.copyAnnouncementLink(btn);
  assert.deepEqual(sandbox.copied, ['https://neontemple.net/announcements/#announcement-a-7']);

  sandbox.closeModal();
  assert.equal(sandbox.location.hash, '', 'closing clears the announcement anchor');
});
