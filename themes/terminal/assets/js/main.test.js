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
  };

  const code = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'main.js' });
  return sandbox;
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
