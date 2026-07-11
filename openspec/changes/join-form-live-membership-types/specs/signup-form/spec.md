# signup-form Specification

## ADDED Requirements

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

#### Scenario: Payment-mode signup redirects to checkout

- **GIVEN** the backend responds to signup with a `checkout_url`
- **WHEN** the form submission succeeds
- **THEN** the browser navigates to that URL

#### Scenario: Approval-mode signup keeps the email message

- **GIVEN** the backend responds to signup without a `checkout_url`
- **WHEN** the form submission succeeds
- **THEN** the success message directs the visitor to check their email
