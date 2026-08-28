# Doctrine

Every rule in this package answers one question: what is the decay rate of this
sentence, and what invalidates it.

This file holds the answers. The skills link here and do not restate, because a
rule written in two places drifts, and then whichever copy an agent happens to
read wins. If you are looking for how a rule is enforced, that is in the skill
and in the validator. If you are looking for why the rule exists at all, it is
here.

## The spine

| Layer      | Answers                        | Tense                       | Decay                            | Invalidated by          |
| ---------- | ------------------------------ | --------------------------- | -------------------------------- | ----------------------- |
| Code       | how                            | now                         | none, it is the truth            | nothing                 |
| Wiki       | why, and where to look         | present, rewritten in place | slow if names-only               | a migration or a deploy |
| Docs       | what we decided, and when      | frozen at its date          | none, the date is the disclaimer | nothing                 |
| Tracker    | what we intend, and is it done | live                        | not applicable                   | the work                |
| Checklists | what we observed               | append-only                 | none                             | a new build             |

A rule that does not trace to a row of this table does not go in. That is the
admission test for a new rule, and the first question to ask of an existing one
that feels wrong.

The table also ranks danger, which is less obvious and matters more. What is
dangerous is prose in the present tense carrying nothing that says when the
present was: a wiki page, a README, a status paragraph. Those read as true
forever. A tracker entry, by contrast, gets checked against the work constantly,
and a shipped document misleads only a reader who ignores its date. Every
review-age rule in this system exists to put a date back on the first group.

The Docs row says "frozen at its date", and that is true of a shipped document
and of nothing else. A `lifecycle` doc is only frozen once it ships. While it is
`active` it carries live progress prose, which is correct while the work is open
and wrong the moment it closes, and nothing about the filename marks that
transition. So an `active` doc ages like present-tense prose and is flagged like
it, by `stale_after_days`. The date on the front is a disclaimer only after the
freeze.

## One authoritative home per fact

| Fact                            | Home                               |
| ------------------------------- | ---------------------------------- |
| What we intend to build         | tracker, always                    |
| Whether a piece of work is done | tracker status, nowhere else       |
| What ships when, in order       | roadmap doc, or nothing            |
| Evidence it actually works      | checklist rows, or the finish note |
| How it will be built            | plan or spec doc                   |
| How it works now                | wiki                               |

Other places may link to or derive from the authority. They may not restate it
independently. A roadmap row saying "Done 2026-08-24" is a projection of tracker
state and is legal. A README paragraph narrating current status from memory is a
second authority and is not.

"Or nothing" in the roadmap row is a real option. A repo that ships continuously
has no ordered list of what lands when, and inventing one gives it a document
that nobody updates. Absence of a roadmap is a configuration, not an omission.

The rule about the tracker holds whether the tracker is ClickUp, Linear, or a
markdown file in the repo. With an external tracker it holds trivially, since no
other system can carry issue state. With `tracker.backend: in-repo` it needs
saying out loud: the file named in the profile is the sole authority, and any
other file in the repo that narrates what is in progress is in violation.

## Names and positions

A **name** is part of an interface. It is stable, greppable, and changes loudly
through a migration, a deploy, or a released version. Table names, service and
stack names, environment names, package names and path aliases, public routes,
queue and topic names, exported API names, schedule expressions.

A **position** is where something currently sits. It changes silently in any
edit, and once it is wrong it is not greppable. Line numbers, line ranges,
directory trees.

Prefer names. Two reasons, and the second is the one people miss.

The first is decay. `orders.ts:101-110` is wrong the next time somebody adds an
import, and nothing announces it.

The second is that names are what make drift detection possible at all. The
housekeeping sweep finds pages that need review by taking the names off a page
and grepping for where they live now. A stale name still points somewhere. A
stale line number points nowhere and cannot be traced, so a page written in
positions is invisible to the only mechanism that would have caught it.

That is also why there is no frontmatter key naming the paths a page watches.
The design document offered one, and it does not exist: the frontmatter
contract is closed at five keys, so it would be an error by a rule that
predates it, and a list of paths is a list of positions. Putting them in
frontmatter, where only a tool would ever read them, moves the decay to the one
place no reader passes. A page that needs to pin a file cites it in the body,
where a reader sees it, and the sweep reads a cited path as a name of its own
kind. A page with nothing greppable at all, which is the ordinary shape of one
about a convention or a legal position, is surfaced on age instead. Ordering by
age is a worse answer than tracing, and it is the honest one: the sweep says
which of the two it did for every page, because a heuristic a reader mistakes
for a proof is worse than no heuristic.

The enforced ban is narrow, because a wider one deletes contracts while claiming
to protect them. Call syntax like `useToast()`, fenced code blocks showing a
contract shape, and bare dates are all allowed. They were measured against real
wikis before the rule was written, and banning them would have hit the pages
that document interfaces most carefully.

| Pattern                                             | Severity                                  |
| --------------------------------------------------- | ----------------------------------------- |
| line numbers and ranges (`file.ts:101-110`)         | error                                     |
| directory trees in prose                            | error                                     |
| file paths with a code extension                    | `wiki.path_citations`, default `citation` |
| snapshot markers (`currently`, `recently`, `as of`) | warn                                      |

`wiki.path_citations` is the one rule in this system whose policy a project
sets, because two live projects hold opposite positions on file-path citations
and both are right for their audience. It takes `forbidden` or `citation`. There
is deliberately no `off`: a severity dial invites silencing the rule, a policy
choice does not. Under either setting the validator reports the count of path
references, so the inventory stays visible even where the practice is
sanctioned.

`path_citations` is the only configurable policy in the system. A proposal to
add a second one should be read as evidence that the rule under discussion is
wrong, not that it needs a dial.

## Mode

Mode is declared per path in the profile and never inferred. An agent resolves
it and states it out loud before starting, so a wrong reading surfaces in the
first line instead of in the diff.

|                  | greenfield                    | mature                                |
| ---------------- | ----------------------------- | ------------------------------------- |
| wiki update      | at milestone boundary         | same commit as the change, CI-gated   |
| plans            | numbered, written before code | optional; the ticket is the unit      |
| specs            | expected per subsystem        | only for cross-cutting change         |
| breaking changes | free                          | need a migration path                 |
| refactor         | rewrite freely                | blast-radius check on consumers first |
| done means       | acceptance evidence           | shipped, wiki updated, no regression  |
| tracker          | may be in-repo                | external, ticket per change           |

Per path, not per project, so a greenfield subsystem inside a mature repo does
not inherit mature ceremony and a hardened package inside a young app does not
lose it.

A change that touches both does not pick one mode. Each touched path keeps its
own gates. Split the change only if the parts are independently valid, which
they often are not: a change to an exported type and the caller update that
follows it must land together or both commits fail CI. For a cross-mode change
that cannot be split, keep one commit and apply the strictest gates to the
whole of it.

## Fixed versus project-local

The dividing line is mechanical. **If editing it would break a validator, it is
fixed in the skill. Otherwise it is a template the project owns.**

Fixed: frontmatter shape, link resolution, bidirectionality, reachability, size
budget, position bans, doc lifecycle, the fold gate, profile schema.

Project-local: voice, which wiki profiles exist, section conventions, house
rules, and every stack-specific convention.

Code rules are templates rather than a skill on purpose. They vary per project,
and a versioned dependency is the wrong container for something that has to be
edited locally. A project copies `house-rules.md` once and then owns it.

## Documents have classes, not locations

The lifecycle applies to declared globs, never to everything under a docs root.
A docs root holds research reports, privacy policies, branding assets and device
checklists alongside its specs, and a blanket naming rule would make violations
of all of them. That is how a validator gets switched off.

Seven classes. `lifecycle` for specs and plans, the only class that is
date-named, frozen on shipping, and subject to the fold gate. `live` for READMEs
and roadmaps, free-named and review-aged. `tracker` for the in-repo backend.
`checklists` for append-only evidence. `reference` for material dated by its own
content. `assets` for everything not validated. And `ignored`, which is a class
rather than an exemption, so that a deliberate exclusion is a glob somebody
wrote down instead of a silence.

Every file under a docs root matches exactly one class. No match is an error and
not a silent pass, because a stray dated plan landing outside the declared globs
would otherwise escape naming, freezing and the fold gate together. Matching two
classes is also an error, since a file that is both `reference` and `lifecycle`
has no answer to what its rules are.

Three things under a docs root are exempt, and each for a reason worth knowing.
Anything under the declared wiki root, because that root often sits inside the
docs root and its pages answer to `wiki-validate` instead. A
`project-profile.yaml`, because it is
configuration rather than a document, and the recommended layout puts each
product's profile at that product's docs root, so the rule would otherwise fail
the layout this system tells people to adopt. And a file already claimed by a
profile closer to it, which is how a product docs root nested inside the
repository's stays classified from one place rather than two.

A class glob may also reach outside the docs root. A leading `/` makes it
repo-root-relative, which is how a front-door `README.md` gets a class without
being moved under `docs/`.

### The lifecycle contract

Three statuses, in order. A `draft` is being written. An `active` doc describes
work in progress and is flagged once it goes `stale_after_days` without a
commit. A `shipped` doc is closed, and shipping is the only moment at which
folding into the wiki reliably happens, which is why the gate sits there.

Shipping requires two things beyond the status word. `folded_into` lists the
wiki slugs the document's content now lives in, and every one of them must
resolve. `frozen_body_sha256` records the body, and `docs-freeze` writes it,
because a SHA-256 computed by hand at the moment of shipping is a step nobody
performs and the rule would then be enforced against a key that never gets
written.

Changing the body of a frozen document afterwards needs either `supersedes`
pointing at a newer document or an explicit `reopened_reason`. Reopening is
allowed. Reopening silently is not.

Freezing is by body hash rather than git history. Git-based immutability
false-positives on the routine: a rebase, a formatting sweep, a frontmatter
migration, or a wiki slug rename that forces a `folded_into` update. Hashing the
body after the frontmatter keeps metadata and link maintenance legal while the
substance stays frozen.

## Done

Done is tracker state plus evidence. Code existing is not done, and neither is a
green local run nobody recorded.

The form of the evidence follows the profile, which is what the authority table
above means by the in-repo checklist row. Where the product declares
`checklists` globs, evidence means the named rows are ticked. Where it declares
none, as a repo on continuous delivery reasonably does, evidence means the
command and its output in the finish note. The
obligation is constant either way.

## Where the rules are enforced

Seven bins, runnable by any agent and by CI. Each takes `--repo <dir>` and
`--json`, exits 0 when nothing is wrong, 1 when the repository fails a rule, and
2 when the tool could not run at all. Warnings never fail a run.

| Bin                | Enforces                                                      |
| ------------------ | ------------------------------------------------------------- |
| `project-validate` | the umbrella: profiles, wiki and docs in one pass             |
| `profile-validate` | profile schema, product paths, owner scopes, dead patterns    |
| `wiki-validate`    | frontmatter, link symmetry, reachability, position bans       |
| `docs-validate`    | doc classes, and the rules of each class                      |
| `docs-freeze`      | writes `frozen_body_sha256` into a lifecycle doc as it ships  |
| `guard-generated`  | refuses edits to generated output, or outside a clone's scope |
| `wiki-drift`       | nothing: it orders the wiki pages by what moved under them    |

The umbrella runs the three checks that judge a repository as it stands. The
other three are deliberately outside it, and the design document, which
describes it as running all of them, predates that split. `guard-generated`
judges a change rather than a repository, so it belongs where the change is
being made and not on whatever machine runs CI. `docs-freeze` writes, and a
validator that edits files while reporting on them is a validator nobody can run
to find out where they stand.

`wiki-drift` is the odd one, and its row says "nothing" for a reason. It
enforces no rule: it answers what to read next, which is a different question
with a different exit code. A queued page is not a fault, so it exits 0
whenever it produced a list and 2 only when it could not run, and putting it in
the umbrella would mean failing a build over a grep. It is the tool the
housekeeping sweep is built on and it belongs to nobody else's gate.

The other half of that sweep, diffing the names the repository has against the
names the wiki mentions, stays manual. Enumerating them well means knowing
where this repository keeps its service names, its table names and its
workspaces, and a profile block declaring per-repo extractors is deferred until
the manual version has run often enough to say what is worth declaring.

## Which skill fires when

| Skill            | Fires                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `wiki-authoring` | creating or editing a wiki page; in mature mode, at feature end      |
| `project-docs`   | writing a spec, plan, research note or handover, and on shipping one |
| `task-tracking`  | at task start, at ticket writes, and at finish                       |
| `housekeeping`   | on request, at a once-a-week-or-two cadence                          |

## Finding the profile that applies

Every rule in this file is read out of a profile, so the first move in any skill
is resolving which profile governs the path in hand. The answer is the same
everywhere, and it is stated once here so that four skills do not each describe
it.

**Resolution is by `paths` glob, not by directory ancestry.** A product owns
disjoint subtrees at once: an app directory, a set of packages matching a
pattern, and a docs directory that sits nowhere near either. Ancestor-based
lookup, the way tsconfig and eslint work, cannot express that, because a file
under a shared `apps/` directory has no profile above it that belongs to only
one product. So every profile that configures this repo is discovered, a
path-to-product index is built from their `paths` fields, and resolving a file
is a match against that index. Product `paths` may not overlap; no file belongs
to two, and two patterns overlap when they could ever name the same file rather
than when they are spelled alike.

Anything unclaimed falls back to the root profile acting as the default product.

"Configures this repo" is doing real work in that sentence. A profile that
declares repo-wide settings and names no product is another repository's root,
not a product of this one, so it is treated as a boundary and skipped along with
everything beneath it. Test fixtures and vendored checkouts are the common case.
A run says which boundaries it skipped, because a silent skip is only
trustworthy if it names what it passed over.

**A single-product repo has one profile, and it carries the product fields
directly.** `docs`, `roadmap`, `mode` and `tracker.project` sit alongside `wiki`
and `generated_paths` in the root file. The two-file split exists only to keep
several products in one repo from contending on a single file, so a repo with
one product should not pay for it. Most repos are this shape.

Because resolution is by glob, the profile file's own location is free. Putting
each product's profile at that product's docs root is the recommendation, since
it keeps each clone of a shared monorepo editing only files it owns.

## Owners are not products

Ownership and product are separate axes, and collapsing them loses a rule that
real monorepos need. An **owner** scope says what a given clone may write. A
**product** says which docs, tracker project and mode apply.

They do not partition the same way. A shared UI package is owned by one clone
and consumed by every product, and the default owner claims everything no other
owner claimed, which is a complement that no union of globs can express. So
owners are declared explicitly, at most one of them carries `default: true`, and
overlaps between two explicit owners are a schema error.

Resolving the current owner cannot use git remotes, since several clones of one
repo share an origin URL. Resolution is, in order: a gitignored `.agent-owner`
file at the clone root, then the basename of the clone's main working tree via
`git rev-parse --git-common-dir`, then error.

**Writing outside your scope has two severities, and the difference is whether
somebody claimed the path.** A path another owner listed in its own `paths` is
an error: make that change in the clone that owns it, push, and pull it back. A
path no explicit owner claims is a warning, whether it falls to a default owner
by complement or no default exists at all. That is where root configuration and
lockfiles live, and every clone touches those. One severity for both would
refuse every dependency install, which is how a guard gets uninstalled.

The warning still fires, because "nobody owns this" is not the same as
permission. It asks for the path to be given to an owner so the next change gets
a real answer.

A change to a path an owner claims explicitly and marks `shared: true` needs a
consumer blast-radius check before it lands. Only the explicit claim triggers
it. A shared owner that is also the default would otherwise demand an audit of
every unclaimed file in the repo, nearly none of which has a consumer.

Single-clone repos leave the block out.

## The prose in this file

No em dashes. The housekeeping unslop pass sweeps them, so a document that
teaches the sweep should not need it.
