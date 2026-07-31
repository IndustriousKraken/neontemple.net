# signup-form Specification

## MODIFIED Requirements

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
