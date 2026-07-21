# Design

## Tokenizer, not DOM

The natural browser implementation (parse into a detached `<template>`, walk
text nodes, serialize) is unavailable in the test harness: `main.test.js` runs
`main.js` in a Node `vm` sandbox with a minimal stub `document`, no HTML
parser. `truncateHtml` is therefore a small pure-string tokenizer, unit-testable
in the sandbox.

It is NOT a general HTML parser and does not need to be: its input is
exclusively Coterie's ammonia-sanitized `content_html` (balanced, properly
nested tags; text and attribute values entity-encoded). That is the same trust
basis the modal's `innerHTML` use already relies on.

## Why re-emit kept tags bare

Emitting `<em>` rather than the source tag text sidesteps attribute parsing
entirely (no quoting edge cases, nothing an attribute could smuggle through)
and gives the output a defense-in-depth property: a preview fragment can only
ever contain the whitelisted bare inline tags, entities, and text copied from
already-sanitized input.

## Why links unwrap to text

Preview surfaces are inside elements with `onclick` handlers that open the
announcement modal. A live `<a>` inside would nest interactive targets and
steal clicks. The full modal renders links normally.

## Ellipsis and word boundaries

The cut appends `...` inside the innermost open tag, then closes the stack —
mirroring the plain-text `truncate` helper. No word-boundary trimming, same as
`truncate`.
