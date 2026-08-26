# Feature Documentation for Agents

This runbook is the authoritative rule set for writing and organising feature
documentation under `docs/features/`. Read it before creating or restructuring
anything there — a feature epic, a `PLAN.md`, a `PRD.md`, a `TECH_SPEC.md`, a
numbered step, a feature's `follow-ups.md`, or anything in `.tasks/`,
`.tech-debt/`, `.bugs/`, `.backlog/`, `.archive/`, or `.plans/`.

Unlike the other runbooks, this area has no paired charter: this file is both the
rules and the rationale. Changes that are limited to docs here are
documentation-only and do not require `pnpm verify` (see AGENTS.md → "When
validation may be skipped").

---

## When to Read This File

Read this file before any of:

- creating a new feature epic directory under `docs/features/`
- writing or restructuring a `PLAN.md`, `PRD.md`, or `TECH_SPEC.md`
- breaking a feature into numbered implementation steps
- writing a feature's `follow-ups.md` (loose ends from feature work)
- filing small, off-roadmap work under `.tasks/`, `.tech-debt/`, or `.bugs/`
- adding or scoping a `.backlog/` entry
- archiving a completed feature or task into `.archive/`
- saving a standalone implementation plan not tied to a feature epic into
  `.plans/`

If your task only _reads_ an existing feature doc in order to implement code, you
do not need this file — follow that feature's own `PLAN.md` instead. Respect the
read boundaries in `docs/CONTEXT.md`: `.archive/`, `.backlog/`, `.tasks/`,
`.tech-debt/`, `.bugs/`, and `.plans/` are not auto-read context.

---

## Mental Model

- A **feature** is an _epic_: one directory under `docs/features/<feature-name>/`.
- A **step** is a _task / user story_: one numbered unit of work that moves the
  epic toward done.
- `docs/features/` holds active, scoped epics. Dot-prefixed buckets sit
  alongside them:
  - `.backlog/` — planned but not-yet-scoped features (planning TODOs); one
    `BRIEF.md` each.
  - `.tasks/` — general off-roadmap work not tied to a specific feature.
  - `.tech-debt/` — refactors, cleanup, maintenance.
  - `.bugs/` — defects to fix.
  - `.archive/` — completed features kept for historical reference.
  - `.plans/` — standalone saved implementation plans not tied to a feature
    epic (see "`.plans/` — Saved Implementation Plans" below).
- A feature's own loose ends are **not** a bucket: they live **co-located** at
  `docs/features/<feature>/follow-ups.md`, so they stay in auto-read context while
  the feature is active and don't get missed.

Lifecycle: **`.backlog/`** (a `BRIEF.md` — scope it) → **`docs/features/<name>/`**
(a `PLAN.md` — build it, tracking loose ends in `follow-ups.md` only once they
arise during/after the build) → **`.archive/`** (done).

---

## Directory Layout

### Single-track feature

```txt
docs/features/<feature-name>/
  PLAN.md            # REQUIRED — the one doc every feature must have
  PRD.md             # optional — product requirements
  TECH_SPEC.md       # optional — technical specification
  follow-ups.md      # added LATER (impl/review), never at planning — see "Follow-ups …"
  01-<name>.md       # step (task / user story) — flat file is the default
  02-<name>.md
  03-<name>/         # promote a step to a folder ONLY when it needs >1 doc
    implementation.md
    notes.md
```

### Cross-cutting feature (backend + frontend)

When a feature spans backend and frontend, split the steps into `backend/` and
`frontend/` subfolders. Each subfolder owns a `PLAN.md` scoped to that side plus
its own numbered steps; the top-level `PLAN.md` ties the two together. A single
`follow-ups.md` at the feature root covers both tracks (created later, when loose
ends arise — not at planning time).

```txt
docs/features/<feature-name>/
  PLAN.md            # top-level plan — the whole feature
  follow-ups.md      # added LATER (impl/review), never at planning; ONE file, both tracks
  backend/
    PLAN.md
    01-<name>.md
    ...
  frontend/
    PLAN.md
    01-<name>.md
    ...
```

Tracks beyond `backend/`/`frontend/` are fine when a feature has natural seams
(e.g. a large epic splits into `api/`, `jobs/`, `admin/`). Same rule:
each track folder owns a `PLAN.md` + numbered steps.

Regenerated client output (`pnpm gen:client`) ships **in the same PR as the
contract change that caused it** (`CLAUDE.md` § Backend Development) — plan the
backend→frontend seam without a standalone generation-only PR, and without
acceptance criteria like "`packages/services` is untouched by this track" that
depend on one.

### Naming rules

- `PLAN.md`, `PRD.md`, `TECH_SPEC.md` — uppercase, exactly these names. A
  `.backlog/` entry uses `BRIEF.md` (uppercase) in place of `PLAN.md` until it is
  promoted — see `.backlog/` below. Never `README.md` for a feature/backlog doc.
- Feature directory — `kebab-case`, named for the epic (`user-onboarding`,
  `email-notifications`).
- Step files — zero-padded `NN-kebab-name.md`, numbered in execution order
  (`01-…`, `02-…`). Use a suffixed number (`05b-…`) only to insert a step
  without renumbering the rest.
- A step is a **flat file by default**. Promote it to a folder
  (`NN-name/implementation.md`) ONLY when the step genuinely needs more than one
  doc. `implementation.md` is the entry doc inside a step folder.

---

## Writing `PLAN.md`

`PLAN.md` is the one required doc, and it is **dual-audience and dual-use**:

- **Read & reviewed by humans** — both non-technical and technical stakeholders,
  who may not open it until well after it is written.
- **Pasted into a fresh agent window** — to implement directly, or to break it
  down into steps (see the `breakdown` skill) — in a session that has **none of
  the conversation context** that produced the plan.

**Assume cold, asynchronous consumption.** By the time anyone — human or agent —
opens this plan, the conversation that created it is gone. Do not rely on the
user reviewing it first, on prior messages, or on shared context an agent
"already has": there is none. The plan must stand entirely on its own. It
combines the _what_ (PRD), the _how_ (TECH_SPEC), and the implementation approach
into one self-contained document. When standalone `PRD.md` / `TECH_SPEC.md`
exist, `PLAN.md` summarises and links them rather than copying their content;
when they don't, `PLAN.md` carries that content itself.

### Required shape

1. **Executive Summary** (top, non-technical). The high-level overview a
   non-technical stakeholder reads — and the **only** part they read. Plain
   language, no jargon: what the feature is, who it's for, why it matters, and
   what "done" looks like. A few short paragraphs at most.

2. **Everything below the summary is for technical stakeholders**, who read the
   whole document. Include, in proportion to the feature's size:
   - **Context** — current state, the problem, the goal; links to `PRD.md` /
     `TECH_SPEC.md` / relevant charters.
   - **Requirements** — functional and non-functional; separate confirmed
     decisions from open questions.
   - **Constraints** — non-negotiables, dependencies, and what must not change.
     Cite `AGENTS.md` and the binding `docs/agents/*.agents.md` runbooks rather
     than restating them.
   - **Architecture / implementation approach** — how it will be built: key
     components, data flow, contracts.
   - **Implementation steps** — a table mapping each `NN-…` step to what it
     delivers and its dependencies.
   - **Success criteria / verification** — how you'll know it works, including an
     end-to-end check to run after all steps land.

### Carry the context a fresh agent needs

A fresh agent has only what the plan gives it. Bake in the context so it is
actionable cold, with no follow-up questions:

- **Point to the code by real path.** Name the concrete files, directories,
  modules, and entry points the work touches — not vague descriptions an agent
  would have to go hunting for.
- **List the read-first docs.** Link the `agents/*.agents.md` runbooks, charters,
  and nearest `CONTEXT.md` files the implementer must read before touching code,
  so the agent loads the rules instead of guessing them.
- **State current state, dependencies, and assumptions.** What exists today,
  what's already merged, what this plan builds on — so the agent neither
  rediscovers it nor contradicts it.
- **Spell out the binding conventions and constraints** (naming, types, gating,
  auth, the validation commands to run) rather than assuming the agent infers
  them.
- **Define done.** Explicit acceptance criteria and the exact verification
  commands.

Litmus test: if a sentence only makes sense to someone who was in the
conversation when the plan was written, rewrite it so a cold reader can act on
it.

### Rules

- The Executive Summary MUST stand alone: a reader who stops there still
  understands the feature.
- **Cite, don't duplicate.** Link to `PRD.md`, `TECH_SPEC.md`, charters, and
  `agents/*.agents.md` instead of restating them.
- A `PLAN.md` MUST be pasteable into a fresh agent session and still be
  actionable — see "Carry the context a fresh agent needs" above.
- Keep it current. Update the plan when behaviour or scope changes; treat older,
  un-updated plans as possibly stale.

---

## `PRD.md` and `TECH_SPEC.md` (optional)

Add these when a feature is large or contested enough that the _what_ and the
_how_ deserve their own reviewable docs. For small or medium features, a good
`PLAN.md` is enough on its own.

- `PRD.md` — product requirements (problem, users, scope, acceptance). Produce it
  with the `create-prd` skill.
- `TECH_SPEC.md` — technical specification derived from the PRD. Produce it with
  the `create-tech-spec` skill.
- When both exist, `PLAN.md` references them and focuses on sequencing and
  implementation; it does not copy their content wholesale.

Supporting authoring skills: `brainstorm` shapes a raw idea into an `IDEA.md`
before any of these exist; `breakdown` splits a finished plan/PRD/spec into
paste-ready task tickets.

---

## Writing Step Files

Each step is a **self-contained, copy-paste agent prompt** — runnable in the
current session or a fresh one. A step is roughly one task / user story: small
enough to land in a single focused PR. Every step file follows this shape:

- **Objective** — one line: what this step delivers, and explicitly what it does
  NOT.
- **Depends on / Unblocks** — step ordering.
- **Background / Read first** — pointers to the feature `PLAN.md`,
  `CONTEXT-MAP.md`, and the relevant `agents/*.agents.md` runbooks.
- **Scope (this step only)** — the concrete changes.
- **Files** — explicit create / modify list.
- **Constraints** — the repo non-negotiables that bind here.
- **Acceptance criteria** + **Verify** — the commands that prove it (`pnpm
verify` and any targeted checks).

---

## Off-Roadmap Work — `.tasks/`, `.tech-debt/`, `.bugs/`

Small work that does not warrant its own epic, sorted into three dot-prefixed
buckets by nature:

- `.tech-debt/` — refactors, cleanup, maintenance.
- `.bugs/` — defects to fix.
- `.tasks/` — anything else off-roadmap that isn't a bug or tech-debt **and isn't
  tied to a specific feature** (e.g. small cross-cutting chores).

One file per item; no `PLAN.md` requirement. None of the three are auto-read —
open a bucket only when working a tracked item.

### Follow-ups belong to the feature, not a bucket

**`follow-ups.md` is not a planning-phase file — never create it while planning a
feature.** A newly-planned feature has no follow-ups: planned work belongs in
`PLAN.md` and the numbered step files. Do not scaffold an empty or stub
`follow-ups.md` next to the plan. The file is created **lazily** — only when the
first real loose end exists.

**Create it only once implementation is underway or done**, to capture
_unplanned_ work the plan did not foresee — for example:

- PR-review feedback too big for the current PR and outside the original plan;
- new requirements or changes that surface after implementation has started and
  were not anticipated during planning;
- gaps found after the initial implementation is built and reviewed.

**What does _not_ go here:**

- **Critical work that must happen now** — don't bury it as a follow-up. Promote
  it to its own scoped feature epic (`docs/features/<name>/PLAN.md`) so it is
  planned and prioritised, not treated as an afterthought.
- **Work unrelated to this feature** — triage it by nature into `.tech-debt/`,
  `.bugs/`, or `.tasks/`; if it is a large, not-yet-scoped feature, add a
  `.backlog/<name>/BRIEF.md` for future planning.

Loose ends that _do_ belong here — non-critical, feature-related, and unplanned —
go in **`docs/features/<feature>/follow-ups.md`**, co-located with the feature so
they stay in auto-read context and get picked up right after the main work lands,
instead of being buried in a bucket nobody opens. One file per feature, holding
**both backend and frontend** follow-ups (for a cross-cutting feature it sits at
the feature root, not inside `backend/` or `frontend/`). Use this shape:

```md
# Follow-ups: <feature-name>

Loose ends from the <feature-name> feature. Resolve or triage into
`.tech-debt/` / `.bugs/` / `.tasks/` before this feature is archived.

## Backend

- [ ] <task> — <why / where (file:line)>

## Frontend

- [ ] <task> — <why / where (file:line)>
```

**When a follow-up has no active feature** — the feature is archived, or never had
its own directory — don't leave it in a feature dir: **triage it by nature** into
`.tech-debt/`, `.bugs/`, or `.tasks/`.

---

## `.backlog/` — Not-Yet-Scoped Features

Planning TODOs: features that still need research, discussion, and scoping before
they can be built. Each backlog entry is a single **`BRIEF.md`** — a short
pre-planning outline: executive summary, current state with real paths, high-level
(PRD-level) requirements, scope boundary, dependencies, and open questions. Just
enough to hand to a planning session — **not** a finished plan.

The filename is deliberate. **Do not** name a backlog entry `README.md` (that reads
as directory docs) or `PLAN.md` (reserved for fully-scoped features under
`docs/features/`). `BRIEF.md` signals "scoped enough to plan, not yet planned": it
states the problem and requirements but leaves schema, decision tables, and the
step/bite breakdown to the planning session that turns it into a `PLAN.md`.

Once an entry is fully scoped, **move the directory into `docs/features/`** and
replace its `BRIEF.md` with a complete `PLAN.md` (see "Writing `PLAN.md`").

Do not auto-read `.backlog/` unless an entry is named or referenced by in-scope
work.

---

## `.plans/` — Saved Implementation Plans

Standalone implementation plans that aren't scoped as a feature epic — e.g. a
plan saved directly on request, for work too small or too cross-cutting to
warrant its own `docs/features/<name>/` directory (dependency-update passes,
cross-cutting migrations, one-off refactors).

One kebab-case `.md` file per plan (e.g.
`docs/features/.plans/backend-test-suite-speed-flakiness.md`), no required
internal structure. Not
auto-read — open a plan only when working the tracked item. When a plan turns
out to need the full feature-epic treatment (steps, `follow-ups.md`, PRD/tech
spec), promote it into `docs/features/<name>/PLAN.md` instead of growing it
in place.

Do not confuse this with a feature's own `PLAN.md` under
`docs/features/<feature>/`, which is scoped to that epic and required per
"Writing `PLAN.md`" above.

---

## `.archive/` — Completed Features

Where finished, inactive features and tasks go for historical reference.

### Archiving procedure (in order)

1. **Close out `follow-ups.md` first.** A feature must not be archived with open
   follow-ups — `.archive/` is not auto-read, so they would be lost. Resolve each
   item or triage it into `.tech-debt/` / `.bugs/` / `.tasks/`, then remove the
   now-empty `follow-ups.md`.
2. **Copy the directory OUT of the repo first.** Keep a full historical copy
   somewhere outside the working tree before touching the original. This is a
   user-owned step — confirm the copy exists before proceeding.
3. **Move** the feature/task directory into `docs/features/.archive/`.
4. The archived contents may then be **deleted or replaced with a single
   `README.md`** that summarises what the feature/task was and why it was
   archived.

Do not auto-read `.archive/` unless the user names a specific file.

---

## Checklist — New Feature Epic

- [ ] Directory `docs/features/<kebab-name>/` created.
- [ ] `PLAN.md` present, with a non-technical **Executive Summary** at the top.
- [ ] Technical sections cover context, requirements, constraints, approach,
      steps, and success criteria.
- [ ] Steps numbered `NN-name.md` (folders only when a step needs more than one
      doc).
- [ ] Cross-cutting work split into `backend/` / `frontend/` tracks, each with
      its own `PLAN.md`, when applicable.
- [ ] **No `follow-ups.md` at this stage** — it is created later, only when
      implementation surfaces unplanned loose ends (see "Follow-ups belong to the
      feature, not a bucket").
- [ ] `PRD.md` / `TECH_SPEC.md` added only if the feature warrants them, and
      linked (not duplicated) from `PLAN.md`.
- [ ] Charters and `agents/*.agents.md` rules linked, not restated.

---

## Cross-References

- Feature docs root: `docs/features/` (path shortcut: `feature doc`).
- `docs/` map + read boundaries: `docs/CONTEXT.md`.
- Authoring skills: `brainstorm`, `create-prd`, `create-tech-spec`, `breakdown`.
- Repo non-negotiables and validation: `AGENTS.md`.
