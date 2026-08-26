# Commit Writing Charter

## Purpose

A commit is not a saved snapshot. It is part of the long-term history of the
project, and it is what someone reads while bisecting a regression at an
unhelpful hour.

Good commits keep that history useful for humans — who should not have to
reconstruct context from chat logs, tickets, or memory — and for agents, which
infer project intent from what history actually records.

---

## Core Principles

### 1. One logical change per commit

A good commit can be described in a single sentence. If the title needs the word
"and", it is probably two commits.

```text
Add request ID middleware
Fix session cookie expiry
Refactor session token hashing
Validate signup email normalization
```

Not `Update stuff`, `Fix things`, `Add users and logging and cleanup`, or `WIP`.

The test: **could this commit be reverted without removing unrelated work?** If
not, it is too broad. That matters most when a behaviour change is buried inside
a refactor — split them so the behaviour change can be reverted on its own:

```text
Refactor auth token helpers
Change session expiry to 30 days
```

The same applies to noise. Formatting, generated files, dependency bumps, and
large file moves get their own commits; folded into a feature commit they hide
the change that actually matters.

### 2. Explain intent, not the file list

The diff already shows what changed. The message explains why.

`Add logs` says nothing. This says something:

```text
Add structured request logging

Adds request start, success, and failure logs with a shared requestId so API
requests can be traced consistently across middleware, controllers, and error
handling.
```

### 3. Size it to be reviewable

A commit should be big enough to be a complete logical change and small enough
to review and revert on its own.

Too large if it touches many unrelated areas, needs several review passes, or
mixes refactoring with behaviour changes that could be separated.

Too small if it does not build or pass tests on its own, only works combined
with the next commit, or adds noise without a useful checkpoint.

So instead of one `Add users` commit carrying an entity, DTO validation, a
controller, service methods, tests, and incidental formatting:

```text
Add User entity
Add create-user DTO validation
Add user creation service method
Add user creation endpoint
Add tests for user creation
```

---

## Two Commit Modes

| Mode         | Use when                                                                                                                                                                                    | Shape        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Detailed** | Business logic, security, auth, permissions, user data, architecture, DB structure or migrations, observability, error handling — or the reason for the change is not obvious from the diff | Title + body |
| **Short**    | Small, obvious, low risk; the title fully explains it and there is no meaningful context to add — cleanups, renames, typos, small test or doc updates                                       | Title only   |

When unsure, prefer detailed. Both modes still need one logical change and a
specific title.

### Format

```text
<type>: <clear action-based summary>

<why this change exists>

<what changed>

<risks, tradeoffs, migration notes, or follow-up work if relevant>
```

Short commits are just the first line. Types: `feat`, `fix`, `refactor`, `test`,
`docs`, `chore`, `perf`, `security`, `ci`, `build`. The type helps, but message
quality matters more than the label.

### Detailed example

```text
fix: reject password reset with an expired token

Password reset previously treated an expired token the same as a missing one and
returned an empty result, which made the flow look like the reset silently
succeeded rather than telling the user the link had lapsed.

The endpoint now returns a 400 with a clear error code so the frontend can
prompt the user to request a fresh reset link.
```

A detailed body should make clear what changed, why, what it affects, and any
risks, migrations, or follow-ups. Not every commit needs all of that — the
intent just has to be unambiguous.

### Short examples

```text
fix: correct login form validation message
test: add coverage for expired session tokens
chore: remove unused auth config
Rename user profile DTO
```

Short does not mean vague. `fix: handle missing user row` over `fix bug`;
`chore: remove unused TokenStatus enum` over `cleanup`.

---

## Titles

Lead with an action verb — Add, Fix, Update, Remove, Refactor, Rename, Move,
Validate, Handle, Extract, Introduce, Replace.

Avoid titles that could describe any commit ever written: `Changes`, `Fixes`,
`Stuff`, `WIP`, `Update`, `More work`, `Final commit`.

---

## What Not To Do

Avoid commits that:

- combine unrelated changes, or hide behaviour changes inside a refactor
- mix formatting with feature logic
- use vague messages like `update`, `fix`, `changes`, or `cleanup`
- include large generated changes without explanation
- leave broken tests or incomplete work without saying why
- contain secrets, credentials, tokens, or sensitive data
- depend on context that only exists in a chat window

---

## Commits and Pull Requests

The PR explains the whole story; commits explain the steps within it. A good PR
often contains several:

```text
feat: add EmailVerification entity
feat: issue verification tokens on signup
feat: add verification confirmation endpoint
fix: make verification confirmation idempotent
test: add email verification tests
```

That reads better than one `feat: add email verification`. Commits should make
the PR easier to review, not harder. See `docs/charters/pr-writing.md` for the
PR side.

---

## Agent Expectations

Agents follow this charter when creating or suggesting commits: group changes
into logical commits, explain why each exists, prefer detailed commits for
meaningful changes, and never bundle unrelated work into one commit. Where the
right commit boundary is genuinely ambiguous, say so before committing rather
than guessing.

---

## Final Standard

Before committing, ask: is this one logical change, is the title specific, does
the message explain why, is it easy to review, is it safe to revert, and will it
still make sense six months from now?
