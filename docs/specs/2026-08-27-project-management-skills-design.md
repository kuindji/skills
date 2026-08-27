---
title: Project management skills
type: spec
status: draft
last_updated: 2026-08-27
reviewed_by: gpt-5.5 round 1
---

# Project management skills

A shared, agent-agnostic system that answers, near-deterministically, where each
kind of project knowledge lives, what keeps it from going stale, and how an agent
should behave when writing to any of it.

Consumed by TheFloorr, Riskore, Vigilocity, BearingKind and future projects as a
bun git dependency. Read by Claude Code, by Codex, and by humans.

## The problem

Five questions, currently answered differently in every repo:

1. What belongs in a project wiki, and how do we stop it going stale.
2. Which code rules are general and which are project-local.
3. How to use a task tracker, without naming which tracker.
4. What is a wiki page and what is a dated document.
5. How mature-project work differs from greenfield work.

The evidence that these are unanswered rather than merely undocumented:

- TheFloorr `docs/wiki/PRINCIPLES.md` section 3 requires concrete identifiers on
  technical pages, including file paths. Riskore `CLAUDE.md` forbids file paths
  and code examples in the wiki. Two live projects, opposite rules.
- `docs/baby-sleep-tracker/README.md` opens by declaring its own status prose
  stale past Plan 8. A document claiming to describe the present, which stopped
  being maintained, with nothing marking the transition.
- Five CLAUDE.md and AGENTS.md files repeat the same house rules nearly verbatim.

## The spine

Every rule in this system derives from one question: what is the decay rate of
this sentence, and what invalidates it.

| Layer      | Answers                        | Tense                       | Decay                            | Invalidated by          |
| ---------- | ------------------------------ | --------------------------- | -------------------------------- | ----------------------- |
| Code       | how                            | now                         | none, it is the truth            | nothing                 |
| Wiki       | why, and where to look         | present, rewritten in place | slow if names-only               | a migration or a deploy |
| Docs       | what we decided, and when      | frozen at its date          | none, the date is the disclaimer | nothing                 |
| Tracker    | what we intend, and is it done | live                        | not applicable                   | the work                |
| Checklists | what we observed               | append-only                 | none                             | a new build             |

A rule that does not trace to a row of this table does not go in. The table
lives in `doctrine.md` and every skill links to it rather than restating it.

### One authoritative home per fact

| Fact                            | Home                         |
| ------------------------------- | ---------------------------- |
| What we intend to build         | tracker, always              |
| Whether a piece of work is done | tracker status, nowhere else |
| What ships when, in order       | roadmap doc, or nothing      |
| Evidence it actually works      | in-repo checklist            |
| How it will be built            | plan or spec doc             |
| How it works now                | wiki                         |

Other places may **link to or derive from** the authority; they may not restate
it independently. A roadmap row saying "Done 2026-08-24" is a projection of
tracker state and is legal. A README paragraph narrating current status from
memory is a second authority and is not.

TheFloorr ships continuously and therefore has no roadmap. Baby-sleep is pre-1.0
marching numbered milestones toward an App Store event and therefore has one.
Absence of a roadmap is a valid configuration, not an omission.

## Non-goals

- No npm publishing. Distribution is a git dependency.
- No native Claude Code plugin. Any agent must be able to use this by reading
  files and running commands.
- Not a style guide. House rules are project-owned templates, not skills.
- No general engineering-discipline content in the skills that duplicates
  superpowers (`verification-before-completion`, `test-driven-development`,
  `systematic-debugging`). The house-rules template may restate a rule from that
  territory when a project needs it stated locally, since Codex does not load
  superpowers.
- No self-check commands embedded in wiki pages. A verify command is itself an
  artifact that goes stale; periodic housekeeping replaces it.

## Distribution

Each consuming repo adds this repo as a bun devDependency by git URL, with no
registry involved:

    "@kuindji/project-skills": "github:kuindji/skills#<tag>"

Consumers pin a git tag so an upgrade is deliberate rather than whatever `main`
happened to be at install time. Skills are readable at
`node_modules/@kuindji/project-skills/skills/*/SKILL.md`.
Validators are package bins, runnable by any agent and by CI.

`AGENTS.md` is the root of the system, because it is the one file every agent
reads unprompted. It carries pointers to the house rules, the profile, and the
skills path. A template block ships for pasting in.

## Repo layout

`skills/` is the source root. It is what another project would call `src/`, named
for what it actually holds, because in this repo the skills are the product.
`docs/` is information about that product and nothing else.

    skills/                         (repo root)
    package.json
    project-profile.yaml
    README.md
    skills/                         THE SOURCE
      doctrine.md                   the knowledge map, single source
      wiki-authoring/SKILL.md
      project-docs/SKILL.md
      housekeeping/SKILL.md
      task-tracking/SKILL.md
      templates/                    copied into a consuming repo, owned there
        project-profile.yaml
        house-rules.md
        wiki-principles.md
        AGENTS-block.md
      lib/                          implementation
        wiki/  docs/  profile/  names/
      bin/                          one thin entry point per declared bin
    docs/                           INFORMATION ABOUT THE PRODUCT
      specs/                        dated design documents, frozen once shipped
      wiki/                         how the system works now; empty until M1
      house-rules.md

A skill is a directory containing `SKILL.md`. That is what identifies it, so
`lib`, `bin` and `templates` sitting alongside are not mistaken for skills by a
harness scanning the folder.

A skill directory holds `SKILL.md` and nothing else. A skill that needs to run
something calls a declared bin; it never carries its own script. This keeps every
executable path in one place, testable and reachable by any agent, rather than
scattered across skill folders where only a skill-aware harness would find it.

Consuming repos reference skills at
`node_modules/@kuindji/project-skills/skills/<name>/SKILL.md`.

## Fixed versus project-local

The dividing line is mechanical: **if editing it would break a validator, it is
fixed in the skill. Otherwise it is a template the project owns.**

Fixed: frontmatter shape, link resolution, bidirectionality, reachability, size
budget, position bans, doc lifecycle, the fold gate, profile schema.

Project-local: voice, which wiki profiles exist, section conventions, house
rules, and every stack-specific convention.

Configurable policy, one rule only: `wiki.path_citations`. It exists because
TheFloorr and Riskore already hold opposite positions on file-path citations and
both are correct for their audience. It is a choice between two enforced
policies, not an off switch, and adding a second entry to this list should be
treated as evidence the rule itself is wrong.

## The profile

One root profile per repo. Additional per-product profiles only in multi-product
repos.

**Resolution is by `paths` glob, not by directory ancestry.** A product owns
disjoint subtrees: `baby-sleep-tracker` claims `apps/baby-sleep-tracker`,
`packages/sleep-*` and `docs/baby-sleep-tracker` at once. Ancestor-based
resolution, the way tsconfig and eslint work, cannot express that, because a file
under `apps/` has no profile above it. So every profile in the repo is discovered
by glob, a path-to-product index is built from their `paths` fields, and lookup
is a match against that index. Anything unclaimed falls back to the root profile
acting as the default product.

**A root profile in a single-product repo carries the product fields directly**,
with no separate product file: `docs`, `roadmap`, `mode` and `tracker.project`
sit alongside `wiki` and `generated_paths`. The two-file split exists only to keep
multi-product repos from contending on one file. TheFloorr, Riskore and this repo
each have exactly one profile.

The profile file's own location is therefore free. It sits at the product's docs
root because that keeps each BearingKind clone editing only files it owns, which
a single shared root file would not.

Root profile:

    wiki:
      root: docs/wiki
      profiles: [business, technical]
      business_subtree: business
      path_citations: citation
    tracker:
      backend: clickup
    taskflow:
      enabled: true
    house_rules: docs/house-rules.md
    generated_paths:
      - "hasura/**/*.yaml"
      - "apps/*/ios/**"
      - "**/expo-env.d.ts"

### Owners are not products

Ownership and product are two different axes, and collapsing them loses
BearingKind's actual rule. A clone's **owner** scope says what may be written
here. A **product** says which docs, tracker project and mode apply. They are
not the same partition: `packages/ui` is owned by `main/` but consumed by every
product, and `main/` owns "everything not owned by another clone", which is a
complement no union of globs can express.

So the root profile carries an `owners` block with an explicit default:

    owners:
      main:
        paths: [packages/ui, apps/ui-showcase, web, docs/wiki, docs/specs, scripts]
        shared: true
        default: true          # claims everything unclaimed; at most one
      baby-sleep:
        paths: [apps/baby-sleep-tracker, "packages/sleep-*", docs/baby-sleep-tracker]
      detector-game:
        paths: [apps/detector, apps/game, "packages/{taxonomy,analysis,persistence}", docs/detector, docs/game]
      relocant:
        paths: [backend/relocant, docs/relocant]

**Precedence.** Explicit owner globs match first. Overlaps between two explicit
owners are a schema error. The `default: true` owner claims only what no explicit
owner matched, and at most one owner may declare it.

**Identifying the current owner cannot use git.** All four BearingKind clones
share one origin URL (`github.com/kuindji/bearingkind.git`), so the remote
carries no owner signal. Resolution is, in order: a gitignored `.agent-owner`
file at the clone root; then the basename of the clone's main working tree,
found via `git rev-parse --git-common-dir`, which also resolves correctly from a
worktree under `.worktrees/`; then error. The basename fallback is exactly the
convention BearingKind's AGENTS.md already documents, and the common-dir lookup
is what makes its "derive your scope from the clone the worktree was created
from" rule mechanical.

`guard-generated` then fails a write outside the resolved owner's scope.
Single-clone repos omit the block entirely.

A change touching a `shared: true` owner additionally requires a consumer
blast-radius check, which is the rule BearingKind's AGENTS.md states in prose.

Per-product profile, at the product's docs root:

    product: baby-sleep-tracker
    paths: [apps/baby-sleep-tracker, "packages/sleep-*"]
    roadmap: ./milestones.md
    tracker.project: baby-sleep-tracker
    mode:
      default: greenfield
      overrides:
        packages/sleep-domain: mature
    docs:
      root: .
      lifecycle: ["specs/*.md", "plans/*.md"]
      live: ["README.md", "milestones.md"]
      tracker: []                # set only when tracker.backend is in-repo
      checklists: ["*-checklist.md", "**/launch-checklist.md"]
      reference: ["research/**", "policies/**", "legal-and-compliance/**"]
      assets: ["branding/**", "repros/**"]
      ignored: []
      stale_after_days: 30      # active lifecycle docs
      review_after_days: 90     # live docs

Shapes per project:

- TheFloorr: root profile only. Dual wiki profiles, ClickUp, no roadmap, mature.
- Riskore: root profile only. `profiles: [business]`, no roadmap.
- BearingKind: root profile plus four product profiles.

### Profile-derived checks

- `roadmap` is optional, and at most one per product.
- `paths` globs must not overlap across products. No file belongs to two.
- The generated union of every product's `paths` replaces BearingKind's
  hand-maintained clone ownership table in AGENTS.md, and a diff writing outside
  the current clone's scope becomes a validator failure rather than a paragraph
  an agent has to remember.
- `generated_paths` makes the do-not-edit-generated-files house rule
  machine-checkable against a diff.

## Skill: wiki-authoring

Fires when creating or editing a wiki page, and in mature mode when finishing a
feature.

Carried over from TheFloorr and enforced: frontmatter contract (`title`,
`parents`, `children`, `related_pages`, `last_updated`); bidirectional
parents and children; symmetric `related_pages`; reachability from README; size
budget, warning above 700 words of body and erroring above 1,000, carried over
from TheFloorr; business-subtree self-containment when
`business_subtree` is declared; the split rule when a page outgrows its budget.

New and enforced, the **names versus positions** rule:

A **name** is part of an interface. It is stable, greppable, and changes loudly
through a migration, a deploy, or a released version: table names, service and
stack names, environment names, package names and path aliases, public routes,
queue and topic names, exported API names, and schedule expressions.

A **position** is where something currently sits. It changes silently in any
edit and is not greppable once wrong: line numbers, line ranges, and directory
trees.

Measured against the real corpora, the earlier formulation was wrong in three
ways. TheFloorr's wiki uses `rate(1 minute)` and `now()`, which are EventBridge
and Postgres contracts, not code locations. BearingKind's UI wiki cannot describe
the shared component contract without `useToast()` and `createAlertController()`,
which are the most stable names in that codebase. And 4 of its 10 pages use code
fences to show contract shapes. A ban on call syntax or fenced blocks would
delete contracts while claiming to protect them.

So the enforced ban is narrow:

| Pattern                                             | Severity                                  | Rationale                                         |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| line numbers and ranges (`file.ts:101-110`)         | error                                     | maximum decay, zero value over the bare path      |
| directory trees in prose                            | error                                     | a rendering of a position, stale on any move      |
| file paths with a code extension                    | `wiki.path_citations`, default `citation` | genuinely useful as citation, genuinely decaying  |
| snapshot markers (`currently`, `recently`, `as of`) | warn                                      | current-state prose that reads as fact once stale |

Call syntax, fenced code blocks, and bare dates are **not** banned. Em dashes move
out of the validator and into the housekeeping unslop pass, where a stylistic
preference belongs.

`wiki.path_citations` is the one rule whose policy a project sets, because the
evidence shows projects legitimately differ: TheFloorr built a deliberate
parenthetical citation convention across 77 pages, and Riskore bans paths
outright. It takes `forbidden` (Riskore) or `citation` (TheFloorr).

There is deliberately no `off`. A severity dial invites silencing the rule; a
policy choice does not. Under either setting the validator **always reports the
count** of path references as information, so the inventory stays visible even
where the practice is sanctioned. This is a narrow exception to "validator-backed
rules are fixed", made because two of your projects already disagree and both are
right for their audience.

Measured cost at TheFloorr: 19 pages and 193 occurrences carry line numbers. The
earlier blanket rule would have hit 100 of 150 pages.

The business profile keeps its existing constraints: plain language, no internal
identifiers, no snapshots, terms explained on first use.

## Skill: project-docs

Fires when writing a spec, plan, research note or handover, and when one ships.

**Doc classes, not docs roots.** The lifecycle applies to declared globs, never
to everything under a docs root. Measured: 125 files under
`docs/baby-sleep-tracker` are not date-named, and nearly all are legitimately
permanent (research reports, privacy policies, branding SVGs, device checklists,
repro fixtures). A blanket naming rule would have made every one of them a
violation, which is how a validator gets switched off.

| Class                                   | Naming                | Lifecycle                | Fold gate |
| --------------------------------------- | --------------------- | ------------------------ | --------- |
| `lifecycle` (specs, plans)              | `YYYY-MM-DD-topic.md` | yes                      | yes       |
| `live` (README, roadmap)                | free                  | no, but review-aged      | no        |
| `tracker` (in-repo backend only)        | free                  | no, perpetually live     | no        |
| `checklists`                            | free                  | no, append-only evidence | no        |
| `reference` (research, policies, legal) | free                  | no, dated by content     | no        |
| `assets`                                | free                  | not validated            | no        |

**Every file under a docs root must match exactly one class.** No match is an
error, not a silent pass. Otherwise a stray `docs/baby-sleep-tracker/2026-08-27-sync-plan.md`
landing outside `specs/` and `plans/` escapes naming, lifecycle and the fold gate
entirely, which is the failure the class system exists to prevent. Deliberate
exclusions go in `ignored`, where they are visible.

Enforced on the `lifecycle` class only:

- Filename is `YYYY-MM-DD-topic.md`.
- Frontmatter carries `type` and `status` (draft, active, shipped).
- `shipped` requires `folded_into`, a list of wiki slugs that must resolve.
- A `shipped` doc's body must match its recorded `frozen_body_sha256`.
- An `active` doc with no git commits for `stale_after_days` is flagged.
- `frozen_body_sha256` is a required frontmatter key on `shipped` docs. It is the
  SHA-256 of the file's bytes after the closing frontmatter delimiter, with
  trailing whitespace stripped and line endings normalised to `\n`. Hashing only
  the body means frontmatter and `folded_into` link maintenance stay legal, and
  there is no chicken-and-egg problem writing the key. A `docs-freeze` bin
  computes and writes it at the moment of shipping.

Enforced on the `live` class: a `live` doc with no git commits for
`review_after_days` is flagged for review.

**Freezing is by body hash, not git history.** Git-based immutability
false-positives on the routine: a rebase, a formatting sweep, a frontmatter
migration, or a wiki slug rename that forces a `folded_into` link update. Hashing
the body after frontmatter means metadata and link maintenance stay legal while
the substance stays frozen. A material body edit requires either `supersedes`
pointing at a newer doc, or an explicit `reopened_reason`.

The lifecycle exists because docs are only frozen once shipped. Baby-sleep's plan
files carry live implementation-progress sections for weeks, which is correct
while the work is open and wrong the moment it closes. Nothing currently marks
that transition, and the transition is the only moment folding into the wiki
reliably happens.

The baby-sleep README is a `live` doc, not a `lifecycle` one, so the `active`
staleness flag would never have touched it. That is why `live` carries its own
`review_after_days`. A `live` doc claims to be perpetually current, which makes
an unreviewed one strictly more dangerous than a stale plan, not less. No prose
rule catches that. A git-mtime check does.

## Skill: task-tracking

Fires at task start, at ticket writes, and at finish. Resolves backend and
project from the profile, so the skill never names a tracker.

Protocol:

- **On start:** restate the ticket as understood scope plus intended approach, so
  a wrong reading surfaces before the work rather than in the diff.
- **On finish:** what changed, the evidence command and its result, the wiki
  pages folded, and follow-ups filed as their own tickets rather than buried in a
  comment.
- **In between:** nothing. Progress goes to `taskflow-cli log`, never the tracker.
- Issue state lives in the tracker and nowhere else.
- Done requires tracker state plus evidence. Code existing is not done. Where the
  product declares `checklists` globs, evidence means the named rows ticked, which
  generalizes the rule in baby-sleep `milestones.md`. Where it declares none, as
  TheFloorr does for routine continuous delivery, evidence means the command and
  its output in the finish note. The obligation is constant; its form follows the
  profile.
- Ticket title and description readable by someone new to the project. This
  generalizes TheFloorr's existing ClickUp rule.

### When the tracker is a file

`tracker.backend: in-repo` names a markdown file that **is** the tracker. The
doctrine rule "issue state lives in the tracker and nowhere else" was written
assuming an external system, where it holds trivially. In-repo it needs saying
explicitly: the named file is the sole authority for task state, and no other
file in the repo may carry it. A README that narrates what is in progress is a
second authority and is a violation, exactly as it would be with ClickUp.

The file's shape is fixed enough to validate:

    ## Todo
    - [ ] `P1-03` Owner resolution, .agent-owner and common-dir fallback

    ## In progress
    - [ ] `P2-01` wiki-validate position bans

    ## Done
    - [x] `P1-01` Profile schema
          evidence: bun test skills/lib/profile

`docs-validate` checks the `tracker` class: section headings come from the fixed
set (Todo, In progress, Blocked, Done), every task carries a unique id, no id
appears in two sections, and a task under Done carries an `evidence:` line. That
last check is how "done means evidence, not that the code exists" survives the
move from an external tracker to a file.

The start and finish protocol is otherwise unchanged. Restating scope on start
and recording what changed on finish happen in the task entry rather than in a
ticket comment.

**Taskflow is a separate axis from the tracker.** ClickUp and Linear hold issue
state; Taskflow holds the local session, worktree and log. Both can be present,
and conflating them was a gap in the first draft. The profile carries a
`taskflow` block, and the skill's local contract is fixed regardless of which
external tracker is configured: read task context at start, log commits and
edited files as they happen, log errors when they occur, and never use Taskflow
logs as the home for issue state.

Its validator is the weakest of the four, because it cannot reach ClickUp or
Linear. It checks only that the `evidence` glob resolves and that a `roadmap`,
where declared, exists. Validating commit messages for ticket references is
deliberately excluded: it fails on every legitimate commit that predates a
ticket, and it enforces bookkeeping rather than correctness.

## Skill: housekeeping

Fires on request, at a once-a-week-or-two cadence. Fixes mechanical violations
directly; proposes anything requiring judgment.

Sweep, in order:

1. Run every validator. Auto-fix only the mechanically unambiguous: frontmatter
   shape, link symmetry, em dashes. Snapshot wording and lifecycle transitions
   are proposed, never applied, because both require knowing whether the
   underlying fact changed.
2. **Drift worklist, advisory.** Two inputs. Pages may declare `watch_paths` in
   frontmatter, which is exact. For pages that do not, extract names and grep
   them to current locations. Diff both against the page's `last_updated` and
   queue what changed, ordered by churn.

   This **orders review; it does not claim coverage.** It works well for a page
   whose subject has a unique greppable name and badly for one whose subject is
   a convention, a legal position, or a flow distributed across many files.
   "Describe, never diagnose" is a real rule in baby-sleep with no symbol to
   grep. Declared `watch_paths` is the escape hatch for exactly those pages, and
   an undeclared page that has not been reviewed in a long time is surfaced on
   age alone.
3. Re-read each queued page against current code. Rewrite what drifted, bump
   `last_updated`. Substantive rewrites are proposed, not committed silently.
4. **Coverage gaps.** Enumerate names that exist in the repo (workspace names,
   service names, table names) and diff against names the wiki mentions. What is
   missing is a candidate gap, reported and never auto-filled.
5. Docs sweep. `active` docs past `stale_after_days` are shipped, folded, or
   killed.
   `shipped` docs missing `folded_into` are folded.
6. Unslop pass over touched pages.
7. Report what changed, what was skipped, and what needs a human.

Steps 2 and 4 are the reason this is a skill and not a reminder. They turn an
unbounded sweep into a bounded, ordered worklist.

Preferring names over positions is what makes step 2 possible at all. A stale
line number points nowhere and cannot be traced. A name greps to wherever the
code lives today. That property is the second argument for the rule, independent
of decay.

## Mode

`mode` is declared per path in the profile, never inferred. An agent resolves it
and **states it out loud before starting**, so a wrong reading surfaces in the
first line.

|                  | greenfield                    | mature                                |
| ---------------- | ----------------------------- | ------------------------------------- |
| wiki update      | at milestone boundary         | same commit as the change, CI-gated   |
| plans            | numbered, written before code | optional; the ticket is the unit      |
| specs            | expected per subsystem        | only for cross-cutting change         |
| breaking changes | free                          | need a migration path                 |
| refactor         | rewrite freely                | blast-radius check on consumers first |
| done means       | acceptance evidence           | shipped, wiki updated, no regression  |
| tracker          | may be in-repo                | external, ticket per change           |

Mode is per-path rather than per-project, so a greenfield subsystem inside
TheFloorr does not inherit mature ceremony, and a hardened package inside
baby-sleep does not lose it.

**Mixed-mode changes resolve strictest-per-path.** A change touching greenfield
app code and a mature `packages/sleep-domain` does not pick one mode. Each
touched path keeps its own gates: the mature package needs its wiki page updated
in the same commit and a consumer blast-radius check; the greenfield app defers
its wiki to the milestone boundary. Where that produces two different definitions of done in one commit, split the
change **only if the parts are independently valid**. They often are not: a
`packages/sleep-domain` change to an exported type and the app update that
follows it must land together or both commits fail CI. For an atomic
cross-mode change, keep one commit and apply the strictest gates at commit level:
the mature path's wiki update, a consumer blast-radius check, and evidence for
the change as a whole.

## Templates

Copied into a project once, then owned and edited there.

- `project-profile.yaml` with every field commented.
- `house-rules.md`. Seeded from the intersection of the five existing CLAUDE.md
  and AGENTS.md files: always bun, never npm or yarn; run lint, type-check and
  format before claiming done; no `as any`, narrow `unknown`; never edit
  generated files; no co-authored-by in commits; no worktrees or branches
  without approval; comment what the code does. Every rule carries its rationale
  and its procedure, which is the half that does not fit in CLAUDE.md. A project
  without TypeScript deletes the TypeScript rules.
- `wiki-principles.md`, the project-local prose half: voice, which profiles
  exist, section conventions.
- `AGENTS-block.md`, pasted into AGENTS.md, pointing at all of the above.

Code rules are deliberately not a skill. They vary per project, and a versioned
dependency is the wrong container for something that has to be edited locally.

## Validators

| Bin                | Checks                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile-validate` | schema; owner and product path globs resolve; product paths non-overlapping; at most one `default: true` owner; at most one roadmap per product                                                                                                                                                                                                               |
| `wiki-validate`    | a declared but absent or empty `wiki.root` is a warning, not an error, so a greenfield repo can declare its intent before writing pages; otherwise frontmatter, links, symmetry, reachability, size budget, business self-containment, line-number and directory-tree bans, `path_citations` policy with counts always reported, snapshot markers as warnings |
| `docs-validate`    | every file under a docs root matches exactly one class; for `lifecycle`: naming, frontmatter, fold gate, `frozen_body_sha256`, active-doc staleness; for `live`: review age                                                                                                                                                                                   |
| `docs-freeze`      | computes and writes `frozen_body_sha256` when a lifecycle doc ships                                                                                                                                                                                                                                                                                           |
| `guard-generated`  | fails a diff touching `generated_paths`, or writing outside the current owner's scope                                                                                                                                                                                                                                                                         |
| `project-validate` | umbrella, runs all of the above                                                                                                                                                                                                                                                                                                                               |

## Scope and verification

**Everything in this document is built in one sweep. There is no version gating.**

Codex's round-2 review argued the opposite: that validation infrastructure and
agent workflow are two products, and that shipping both at once means neither
lands. That reasoning is sound for a project with users waiting on a release. It
does not apply here. This project is small, has exactly one consumer to start
with, and phasing it would cost more in coordination than it saves in risk. A
half-shipped validator with no skill to invoke it has no audience at all.

The excluded items below stay excluded, not because they are a later phase, but
because they are not worth building at any point until the core has run for a
while:

- Heuristic name extraction and coverage-gap enumeration beyond the advisory form.
- Auto-applying lifecycle transitions or snapshot rewrites.
- Validating commit messages for tracker ticket references.
- Blanket bans on call syntax, fenced code blocks and bare dates.
- Em dashes as a validator rule; they belong to the housekeeping unslop pass.
- Lifecycle frontmatter on anything outside the declared `lifecycle` globs.

### The repo is its own test corpus

Verification does not wait for a consuming project. This repo already has the
shape every validator needs to exercise:

| Under test                                 | Fixture here                           |
| ------------------------------------------ | -------------------------------------- |
| profile schema, single-product root form   | `project-profile.yaml`                 |
| `lifecycle` doc class, naming, frontmatter | `docs/specs/`                          |
| `live` doc class, review age               | `README.md`                            |
| declared-but-empty wiki                    | `docs/wiki/`                           |
| no-class-match is an error                 | any stray file under `docs/`           |
| `path_citations: forbidden`                | this repo's own setting                |
| in-repo tracker class                      | `docs/tasks.md`                        |
| multi-product, owners, roadmap             | checked-in BearingKind profile fixture |
| dual wiki profiles, external tracker       | checked-in TheFloorr profile fixture   |

`project-validate` exiting 0 against this repo is the acceptance gate for the
whole build, and no other repo is touched until it is met. Writing `docs/wiki/` for real is part of it: the wiki that describes
this system doubles as the corpus `wiki-validate` is tested against, and a
validator whose author could not write a passing page against it is not finished.

Only after that do the test sessions against real repos begin, in the adoption
order below.

## Build order

Not phases, dependency order within one sweep.

1. **Profile.** Schema, owner resolution including the `.agent-owner` and
   common-dir fallback, the path-to-product index, doc-class resolution.
   Everything else reads this.
2. **Validators.** `wiki-validate`, `docs-validate`, `docs-freeze`,
   `guard-generated`, and the `project-validate` umbrella.
3. **Skills and templates.** `doctrine.md`, the four `SKILL.md` files, and the
   templates copied into consuming repos. Thin prose over validators that by now
   exist.
4. **Housekeeping.** The drift worklist and the sweep. Depends on all of the
   above, and is the least certain, so it lands last.
5. **This repo's wiki.** Written against the finished rules, as the acceptance
   gate described above.

## Adoption

**This repo is the only subject until everything works here.** No other repo is
touched, not even read-only, until `project-validate` exits 0 against this one,
all four skills have been exercised on it, and its own `docs/wiki/` is written
and passing.

That creates one risk worth stating plainly. This is the simplest shape the
schema supports: one product, no `owners` block, no roadmap, an in-repo tracker,
a wiki that starts empty. A schema hardened only against it would fit only it,
which is the failure Codex's round-1 review predicted when the original plan put
the hardest repo last.

The mitigation keeps the constraint intact: **the hard shapes arrive as
fixtures, not as adoption.** Profiles for BearingKind (four products, an owners
block with a complement default, per-product roadmaps, shared packages) and
TheFloorr (dual wiki profiles, external tracker, no roadmap, mature mode) are
written into this repo's test corpus and validated there. Nothing is installed
into those repos and nothing in them is modified. The schema gets its coverage;
the constraint holds.

Once the gate is met, the test sessions run in this order:

1. **Riskore.** Smallest real subject. Single product, business-only wiki, no
   roadmap. First repo actually brought into compliance.
2. **TheFloorr.** The wiki-validator's real trial: 150 pages, dual profiles,
   ClickUp, mature mode, and the 19-page line-number worklist.
3. **BearingKind.** Clone ownership, four products, roadmaps, checklists. Its
   profile fixture will already have been passing for some time by then.

Vigilocity follows once the schema has survived all three.

## Deferred

- Name extraction in housekeeping starts heuristic and advisory. If it proves
  valuable, the profile gains a block declaring per-repo extractors (service
  names from `serverless.yml`, table names from migrations, workspace names from
  `package.json`).
- Rule policy is configurable for exactly one rule, `wiki.path_citations`,
  because TheFloorr and Riskore already disagree and both are correct for their
  audience. No general waiver mechanism and no off switch. If another fixed rule proves wrong for a
  project, the rule changes rather than gaining an escape hatch.
- `docs.stale_after_days` is a threshold, not a waiver; a project may tune it.
