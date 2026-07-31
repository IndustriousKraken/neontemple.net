# signup-form Specification

## Purpose
TBD - created by archiving change join-form-live-membership-types. Update Purpose after archive.
## Requirements
### Requirement: The join form offers live membership types under the API's field name

The join form's membership-type `<select>` SHALL be named
`membership_type_slug` (the field `POST /public/signup` reads) and SHALL be
populated at page load from `getMembershipTypes()`: one option per active
type, option value = the type's `slug`, option label = the type's name with
its formatted fee and billing period. When the listing fails or returns no
types, the type field SHALL be hidden and signup SHALL proceed without a
slug, letting the backend apply the org-default type. An empty selection
SHALL be omitted from the signup payload rather than sent as an empty slug.

#### Scenario: Types render from the API

- **GIVEN** the backend returns two active membership types
- **WHEN** the join page loads
- **THEN** the select contains one option per type, valued by slug and
  labeled with name, fee, and billing period

#### Scenario: Listing failure degrades instead of breaking signup

- **GIVEN** `getMembershipTypes()` rejects
- **WHEN** the join page loads
- **THEN** the membership-type field is hidden and a submitted signup omits
  `membership_type_slug`

### Requirement: Signup success follows the payment funnel when offered

When the signup response contains a `checkout_url`, the form SHALL redirect
the browser to it so the visitor completes the Stripe Checkout that
activates their membership. When the response carries no `checkout_url`,
the form SHALL render the existing check-your-email success message. The
password field's `minlength` SHALL match the backend's minimum (10) so the
browser does not green-light passwords the backend rejects.

The password field SHALL additionally carry a **visible hint stating both
bounds** — the backend's 10-character minimum and its 128-byte maximum — so a
visitor learns the ceiling before submitting rather than by tripping it. The hint
SHALL be phrased for a reader rather than quoting the byte figure as though it
were a character count, since the two differ for any non-ASCII password.

The password field SHALL NOT carry a `maxlength` attribute.

Both `minlength` and `maxlength` count UTF-16 code units while the backend
measures UTF-8 bytes at both ends, so **neither attribute expresses the backend's
rule exactly**. That shared imprecision is not what separates them. What separates
them is what each does when it and the backend disagree:

- `minlength` **blocks submission and says so.** The browser shows its own
  message, the visitor sees it, and the entered value is never altered. The worst
  case is a visible false rejection the visitor can respond to.
- `maxlength` **silently clips the value.** A visitor pasting a longer password
  from a password manager would have it truncated with no notification, on a
  **masked** field where the loss is invisible, then submit and store a credential
  they never chose — and be unable to sign in afterwards.

A control that fails loudly and non-destructively is acceptable at this
precision; one that fails silently by mutating the visitor's credential is not.
That is the whole of the distinction, and it is why `minlength` stays and
`maxlength` is excluded.

Client-side length feedback, if provided, SHALL be non-destructive: it MAY warn
that the entered value exceeds the ceiling, measuring UTF-8 byte length so it
agrees with the backend, and SHALL NOT alter, clip, or block the input. The
backend check remains the enforcement; everything on this page is advisory.

The markup SHALL record why no `maxlength` is present, so the omission reads as
deliberate and is not "corrected" by a later contributor.

#### Scenario: Payment-mode signup redirects to checkout

- **GIVEN** the backend responds to signup with a `checkout_url`
- **WHEN** the form submission succeeds
- **THEN** the browser navigates to that URL

#### Scenario: Approval-mode signup keeps the email message

- **GIVEN** the backend responds to signup without a `checkout_url`
- **WHEN** the form submission succeeds
- **THEN** the success message directs the visitor to check their email

#### Scenario: The password ceiling is visible before submitting

- **WHEN** a visitor reaches the password field on the join form
- **THEN** a visible hint SHALL state both the minimum and the maximum, so the
  ceiling is known without submitting the form to discover it

#### Scenario: A pasted over-length password is not clipped

- **WHEN** a visitor pastes a password longer than the backend ceiling into the
  password field
- **THEN** the full value SHALL remain in the field and be submitted as entered;
  no `maxlength` SHALL truncate it, and the backend's rejection message SHALL be
  what informs the visitor

#### Scenario: Client-side length feedback measures the backend's unit

- **WHEN** the form warns that a password is too long
- **THEN** it SHALL measure UTF-8 byte length rather than character count, so the
  warning agrees with the backend's rule, and SHALL leave the entered value
  unchanged

### Requirement: The join form presents a bot-challenge widget when configured

The join form SHALL render a Cloudflare Turnstile bot-challenge widget when a
Turnstile site key is configured, and SHALL send the widget's token with the
signup request. Specifically: when the `turnstileSiteKey` param is non-empty, the
join page SHALL load the Turnstile script and render its `cf-turnstile` widget in
the signup form, and `initSignupForm` SHALL include the widget's response token as
the `captcha_token` field of the signup request. When `turnstileSiteKey` is empty,
no widget or script SHALL be loaded and the request SHALL omit `captcha_token`
(unchanged from prior behavior). Because the token is single-use, a failed submit
SHALL reset the widget so a retry obtains a fresh token.

#### Scenario: Widget and token are present when configured

- **WHEN** `turnstileSiteKey` is set and the join page is built
- **THEN** the page SHALL load the Turnstile script and render a `cf-turnstile`
  element carrying that site key, and a signup submit SHALL include the widget's
  token as `captcha_token`

#### Scenario: No widget when unconfigured

- **WHEN** `turnstileSiteKey` is empty
- **THEN** the join page SHALL load no Turnstile script or widget, and a signup
  submit SHALL omit `captcha_token`

#### Scenario: A failed submit resets the single-use token

- **WHEN** a signup submit fails and the Turnstile widget is present
- **THEN** the widget SHALL be reset so a subsequent submit sends a fresh token

