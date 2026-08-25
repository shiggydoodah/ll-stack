# Commit Writing Charter

## Purpose

This charter defines how we write Git commits and why we write them this way.

A commit is not just a saved snapshot of code. It is part of the long-term history of the project. Good commits make the codebase easier to review, debug, revert, audit, and understand months or years later.

The goal is to keep commit history useful for both humans and AI agents. Humans should be able to understand the reasoning behind a change without needing to reconstruct context from memory, chat messages, tickets, or pull requests. Agents should be able to inspect history and infer project intent more accurately.

---

## Core Principles

### 1. A commit should represent one logical change

Each commit should do one clear thing.

A good commit can be described in a single sentence. It should not mix unrelated work such as a feature change, a refactor, a dependency update, and formatting cleanup unless those changes are directly connected.

Good examples:

```text
Add request ID middleware
Fix session cookie expiry
Refactor session token hashing
Remove unused session relation
Validate signup email normalization
```

Poor examples:

```text
Update stuff
Fix things
Add users and logging and cleanup
Final changes
WIP
```

A useful test:

> Could this commit be reverted without accidentally removing unrelated work?

If the answer is no, the commit is probably too broad.

---

### 2. A commit should explain intent, not just describe files changed

The diff already shows what files changed. The commit message should explain the intent behind the change.

A weak commit message says:

```text
Add logs
```

A stronger commit message says:

```text
Add structured request logging

Adds request start, success, and failure logs with a shared requestId so API
requests can be traced consistently across middleware, controllers, and error
handling.
```

The second version explains why the logs matter and what problem they solve.

---

### 3. A commit should be easy to review

Reviewers should be able to understand a commit without mentally separating unrelated concerns.

For example, this is difficult to review:

```text
Add users
```

Where the commit includes:

- a new entity
- DTO validation
- a controller
- service methods
- tests
- unrelated formatting
- unrelated dependency updates

A clearer sequence would be:

```text
Add User entity
Add create-user DTO validation
Add user creation service method
Add user creation endpoint
Add tests for user creation
```

This makes review easier and makes the project history more useful.

---

### 4. A commit should be safe to revert

Production systems change over time. Sometimes we need to revert a change quickly.

Commits should be scoped so that reverting one commit removes one logical change and does not accidentally remove unrelated fixes or refactors.

Avoid mixing behaviour changes with refactoring where possible.

Less ideal:

```text
Refactor auth service and change session expiry
```

Better:

```text
Refactor auth token helpers
Change session expiry to 30 days
```

The behaviour change is now isolated and easier to review, test, and revert.

---

### 5. A commit should avoid unnecessary noise

Do not mix formatting, generated files, dependency updates, or broad file movements with unrelated feature logic.

If formatting is required, prefer a separate formatting commit.

Good:

```text
Format API project with Prettier
Add email verification entity
```

Less good:

```text
Add email verification entity
```

Where the same commit also reformats dozens of unrelated files.

Noise makes reviews harder and hides the meaningful change.

---

## Commit Message Modes

We use two acceptable styles of commit message depending on the size and importance of the change.

1. **Detailed commits** for meaningful changes where context matters.
2. **Short concise commits** for small, obvious, low-risk changes.

Both styles should still be specific, accurate, and scoped to one logical change.

---

## Option 1: Detailed Commits

Detailed commits should be used when the change affects architecture, business logic, data models, security, authentication, permissions, infrastructure, observability, error handling, or important user-facing behaviour.

They should also be used when the reason for the change is not obvious from the diff alone.

### Detailed commit format

```text
<type>: <clear action-based summary>

<why this change exists>

<what changed>

<risks, tradeoffs, migration notes, or follow-up work if relevant>
```

### Recommended commit types

Use a type when it adds clarity. These are common examples:

```text
feat:     a new feature or capability
fix:      a bug fix
refactor: internal restructuring without intended behaviour change
test:     adding or updating tests
docs:     documentation-only changes
chore:    maintenance tasks, tooling, config, or housekeeping
perf:     performance improvement
security: security-related change
ci:       CI/CD pipeline changes
build:    build system or dependency changes
```

The type is helpful, but the message quality matters more than the label.

---

### Detailed commit example

```text
feat: add request ID middleware

Adds request ID support so API logs can be correlated across middleware,
controllers, filters, and frontend error reports.

- Reads x-request-id when provided
- Generates a request ID when missing
- Echoes the request ID in the response header
- Attaches requestId to the request context

This is foundational for structured logging and future OpenTelemetry work.
```

---

### Another detailed commit example

```text
refactor: move user mapping into UserDtoFactory

Moves user DTO transformation out of UsersService so the service can focus on
persistence and business rules rather than presentation concerns.

- Returns raw user entities from UsersService
- Adds UserDtoFactory mapping for single and paginated responses
- Keeps profile field selection in one place

This makes the user response shape easier to evolve without coupling it to the
service layer.
```

---

### Detailed commits should answer these questions

A good detailed commit should make the following clear:

- What changed?
- Why did it change?
- What problem does it solve?
- What areas of the system are affected?
- Are there risks, tradeoffs, migrations, or follow-ups?

Not every detailed commit needs every section, but the intent should be clear.

---

## Option 2: Short Concise Commits

Short commits are acceptable when the change is small, obvious, and low risk.

They are useful for small cleanups, typo fixes, minor test updates, small UI tweaks, or straightforward config changes.

### Short commit format

```text
<type>: <clear action-based summary>
```

Or, where the project does not require commit types:

```text
<clear action-based summary>
```

### Short commit examples

```text
fix: correct login form validation message
```

```text
docs: update local setup instructions
```

```text
test: add coverage for expired session tokens
```

```text
chore: remove unused auth config
```

```text
Rename user profile DTO
```

---

### Short commits should still be specific

Short does not mean vague.

Good:

```text
fix: handle missing user row
```

Poor:

```text
fix bug
```

Good:

```text
docs: add database reset command
```

Poor:

```text
update docs
```

Good:

```text
chore: remove unused TokenStatus enum
```

Poor:

```text
cleanup
```

---

## Choosing Between Detailed and Short Commits

Use a detailed commit when:

- the change affects business logic
- the change affects security, auth, permissions, or user data
- the change introduces or changes architecture
- the change affects database structure or migrations
- the change affects observability, logging, or error handling
- the reason for the change is not obvious from the diff
- future maintainers will need context
- the commit may be important during debugging or incident review

Use a short concise commit when:

- the change is small and obvious
- the change is low risk
- the title fully explains the change
- there is no meaningful extra context to add
- the commit is a simple cleanup, rename, typo fix, or small test/doc update

When unsure, prefer a detailed commit.

---

## Commit Titles

A commit title should be clear, specific, and action-based.

Prefer verbs such as:

```text
Add
Fix
Update
Remove
Refactor
Rename
Move
Validate
Handle
Extract
Introduce
Replace
```

Good titles:

```text
Add email verification entity
Fix session cookie expiry
Validate password reset token expiry
Refactor log event mapping
Remove unused user relation
```

Weak titles:

```text
Changes
Fixes
Stuff
WIP
Update
More work
Final commit
```

---

## Commit Bodies

A commit body should be used when the title alone is not enough.

The body should explain context and reasoning. It should not simply repeat the title.

A useful body can include:

- why the change was needed
- what approach was taken
- what alternatives were avoided
- what tradeoffs were accepted
- what risk exists
- what follow-up may be needed

Example:

```text
fix: reject password reset with an expired token

Password reset previously treated an expired token the same as a missing one
and returned an empty result, which made the flow look like the reset silently
succeeded rather than telling the user the link had lapsed.

The endpoint now returns a 400 with a clear error code so the frontend can
prompt the user to request a fresh reset link.
```

---

## What Not To Do

Avoid commits that:

- combine unrelated changes
- hide behaviour changes inside refactors
- mix formatting with feature logic
- use vague messages like `update`, `fix`, `changes`, or `cleanup`
- include large generated changes without explanation
- leave broken tests or incomplete work without stating why
- contain secrets, credentials, tokens, or sensitive data
- depend on context that only exists in chat messages or memory

---

## Commit Size Guidance

A commit should be large enough to represent a complete logical change, but small enough to review and revert safely.

A commit is probably too large if:

- the title needs the word "and"
- the diff touches many unrelated areas
- a reviewer would need to review it in separate passes
- part of it could be reverted while another part should remain
- it contains both refactoring and behaviour changes that could be separated

A commit may be too small if:

- it does not compile or pass tests on its own
- it only works when combined with the next commit
- it creates noisy history without adding useful checkpoints

The ideal commit is an understandable, working checkpoint.

---

## Relationship Between Commits and Pull Requests

A pull request explains the full story of a change. Commits explain the individual steps within that story.

A good PR may contain several commits, each representing a logical part of the work.

For example:

```text
feat: add EmailVerification entity
feat: issue verification tokens on signup
feat: add verification confirmation endpoint
fix: make verification confirmation idempotent
test: add email verification tests
```

This is easier to understand than one large commit called:

```text
feat: add email verification
```

Commits should make the PR easier to review, not harder.

---

## AI Agent Expectations

AI agents should follow this charter when creating or suggesting commits.

Agents should:

- group changes into logical commits
- explain why each commit exists
- prefer detailed commits for meaningful changes
- use short concise commits only for small, obvious changes
- avoid vague commit titles
- avoid combining unrelated work
- report any uncertainty before proposing commit boundaries

Agents should not create commits that hide unrelated changes or make the project history harder for humans to understand.

---

## Final Standard

A good commit should help someone understand the project history without needing extra context.

Before writing a commit, ask:

1. Is this one logical change?
2. Is the title specific?
3. Does the message explain why when needed?
4. Is it easy to review?
5. Is it safe to revert?
6. Will this still make sense six months from now?

If the answer is yes, it is probably a good commit.
