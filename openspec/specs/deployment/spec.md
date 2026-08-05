# deployment Specification

## Purpose
TBD - created by archiving change deploy-installs-server-components. Update Purpose after archive.
## Requirements
### Requirement: One command deploys the site and its server-side components

A single command SHALL build the site, publish it to the web host, and bring
every server-side component the repository defines into the state the repository
describes. Deploying and installing SHALL NOT be separate operations an operator
has to know to perform in sequence.

The command SHALL be idempotent. Running it against a host that is already
current SHALL make no change and SHALL report that nothing changed. Running it
against a host missing a component SHALL install that component. An operator
SHALL NOT need to know which of those two situations they are in.

The command SHALL report what it changed, naming each component it installed,
updated, enabled, or left alone. A deploy that silently succeeds tells an
operator nothing about whether the thing they just merged is now running.

A component that cannot be brought into its described state SHALL cause the
command to fail loudly rather than to continue and report success. Reporting
success while a component is absent is the specific failure this requirement
exists to prevent: a merged, deployed feature that returns not-found on every
request with nothing anywhere indicating why.

#### Scenario: A fresh host is fully provisioned by the deploy

- **WHEN** the command runs against a host that has none of the server-side
  components installed
- **THEN** every component SHALL be installed and enabled, and the command SHALL
  report each one

#### Scenario: A current host is unchanged

- **WHEN** the command runs against a host already matching the repository
- **THEN** no component SHALL be modified and the command SHALL report that
  nothing changed

#### Scenario: A stale component is brought up to date

- **WHEN** a component's script or unit differs on the host from the repository's
  version
- **THEN** the deploy SHALL replace it and report having done so

#### Scenario: A component that cannot be installed fails the deploy

- **WHEN** a component cannot be brought into its described state
- **THEN** the command SHALL exit non-zero and SHALL NOT report success

### Requirement: A component declares its own installation

Each server-side component SHALL live in its own directory under the deploy
directory and SHALL declare what installing it means — the files to place and
where, the units to enable, and the prerequisites it requires.

The installer SHALL act on those declarations rather than containing per-component
logic. Adding a component SHALL therefore require no edit to the installer, and a
component SHALL NOT be able to exist in the repository without being installed by
the deploy. That combination is what makes the failure unrepeatable: the reason a
component was previously merged but absent in production is that installing it was
a separate act someone had to remember.

A component's declaration SHALL be the single description of its installation.
Where a component's README also describes installation, that description SHALL be
of what the deploy does, not a parallel set of steps to follow by hand, so the two
cannot disagree.

#### Scenario: A newly added component installs without an installer change

- **WHEN** a component directory is added with its declaration
- **THEN** the next deploy SHALL install it with no modification to the installer

#### Scenario: A component missing its declaration is refused

- **WHEN** a component directory exists without a declaration the installer can
  read
- **THEN** the deploy SHALL fail and name that component, rather than skipping it

### Requirement: The site's web-server configuration ships with the repository

The site's own web-server configuration SHALL be a file in the repository that
the deploy places on the host, rather than a block an operator pastes into a
hand-maintained configuration file.

The deploy SHALL validate the resulting configuration before applying it, and a
validation failure SHALL leave the running configuration untouched and fail the
deploy. Reloading an invalid configuration would take the site down, which is
strictly worse than not deploying.

The deploy SHALL NOT take ownership of configuration for other sites on the same
host. Only this site's configuration is repository-owned.

Where the host requires a one-time change to include the repository's
configuration, that step SHALL be documented in one place and the deploy SHALL
detect and report when it has not been done, rather than appearing to succeed
while the configuration it placed is not being read.

#### Scenario: Web-server configuration changes ride the deploy

- **WHEN** the repository's web-server configuration changes and the deploy runs
- **THEN** the host's configuration SHALL match the repository's and the server
  SHALL be reloaded

#### Scenario: An invalid configuration does not reach the running server

- **WHEN** the repository's configuration fails validation
- **THEN** the running configuration SHALL be unchanged and the deploy SHALL fail

#### Scenario: A host that has not been bootstrapped is told so

- **WHEN** the host has not been set up to include the repository's configuration
- **THEN** the deploy SHALL report that specifically, rather than reporting
  success

#### Scenario: Other sites on the host are untouched

- **WHEN** the deploy applies this site's configuration
- **THEN** configuration belonging to other sites SHALL be unchanged

### Requirement: Unmet prerequisites are reported, never silently skipped

The deploy SHALL detect a missing prerequisite, report exactly what is missing
and the command that resolves it, and fail. This covers anything a component
requires that the deploy will not install itself — a language runtime, a system
package.

The deploy SHALL NOT install system packages or runtimes on the operator's
behalf. A deploy that changes a host's installed software without being asked is
a worse outcome than one that stops and says what it needs.

A component whose prerequisite is unmet SHALL NOT be reported as installed, and
SHALL NOT be left half-installed such that a later run cannot complete it.

#### Scenario: A missing runtime stops the deploy with an actionable message

- **WHEN** a component requires a runtime the host does not have
- **THEN** the deploy SHALL name the component, name what is missing, give the
  command that installs it, and exit non-zero

#### Scenario: A resolved prerequisite completes on the next run

- **WHEN** the operator installs the missing prerequisite and re-runs the deploy
- **THEN** the component SHALL install and be reported

### Requirement: The host's state can be checked without deploying

A check mode SHALL report, without modifying anything, which components are
installed and current, which are missing or stale, and which prerequisites are
unmet.

Answering "is what I merged actually running on the host" SHALL NOT require
performing a deploy or reading each component's documentation. The two occasions
this capability exists to prevent were both diagnosed only after someone noticed
a user-visible symptom; a check that could have been run at any time would have
reported the gap directly.

#### Scenario: Check reports a missing component

- **WHEN** check mode runs against a host missing a component
- **THEN** it SHALL name that component as missing and SHALL make no change

#### Scenario: Check reports a current host as current

- **WHEN** check mode runs against a fully current host
- **THEN** it SHALL report every component as current and SHALL make no change

#### Scenario: Check does not modify the host

- **WHEN** check mode runs against a host with stale or missing components
- **THEN** no file SHALL be placed, no unit SHALL be enabled, and no server
  SHALL be reloaded

### Requirement: Generated content survives a deploy

Generated share pages and other deploy-generated content SHALL survive a
deploy. The deploy SHALL NOT delete files it did not place, and SHALL
explicitly exclude generated share pages from any sync-with-deletion
operation. This exclusion SHALL be stated here and documented in the deploy
command's configuration.

#### Scenario: Generated share pages remain after deployment

- **WHEN** the site is deployed with sync-with-deletion
- **THEN** generated share pages SHALL still be present

#### Scenario: Other deploy-generated content is also preserved

- **WHEN** the site is deployed with sync-with-deletion
- **THEN** any file the deploy did not place SHALL remain on the host

