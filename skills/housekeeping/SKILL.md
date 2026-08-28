---
name: housekeeping
description: Use when asked to sweep, tidy or review the wiki and docs, at a once-a-week-or-two cadence, when someone asks which pages are stale or what the wiki is missing, or before a release when the documentation is meant to be true. Runs the validators, builds the drift worklist with wiki-drift, rereads what it queues, reports coverage gaps, ages the lifecycle docs, and says what needs a human.
---

# Housekeeping

Everything else in this system fires on a change. This fires on a calendar, and
it exists because the failures the other skills prevent are not the ones that
accumulate. A page nobody edited is a page nobody noticed going wrong.

The sweep is bounded. That is its whole design. An instruction to review the
wiki produces either nothing or a fortnight of rereading, so the two steps that
turn it into a list with an end, the [drift worklist](#2-the-drift-worklist)
and the [coverage gaps](#4-coverage-gaps), are the reason this is a skill
rather than a reminder in somebody's calendar.

**Fix the mechanical, propose the rest.** A frontmatter key in the wrong shape
has one correct value and no judgement in it. Whether a sentence is still true
is not a question a sweep can answer from a grep, and a sweep that rewrote
prose on the strength of one would be quietly inventing the wiki. The line
between the two is the only rule here that matters, and it is redrawn at every
step below.

## Read before starting

1. Resolve the profile that governs the repository, by the rule in
   [finding the profile](../doctrine.md#finding-the-profile-that-applies), and
   say which one out loud. A multi-product repo has several, and the sweep runs
   per product: the wiki root, docs root, thresholds and tracker all differ.
2. Resolve the mode of the paths you will touch and say it out loud. On a
   mature path the wiki was meant to land with the change, so a queued page is
   a miss worth naming. On a greenfield path it was meant to land at the
   milestone, and a page behind the code is the expected state between
   milestones rather than a fault. The table is in
   [mode](../doctrine.md#mode).
3. Say when the last sweep was, if you can tell. The tracker knows: a sweep is
   a task like any other and leaves an entry behind.

## The sweep

Seven steps, in order. Each one narrows what the next has to look at.

### 1. Run the validators

```
bunx project-validate
```

Fix only what is mechanically unambiguous:

| Finding                                       | Sweep does     |
| --------------------------------------------- | -------------- |
| frontmatter missing a key, or holding a sixth | fix            |
| an edge declared at one end only              | fix, both ends |
| a link to a slug that moved                   | fix            |
| a snapshot marker (`currently`, `as of`)      | propose        |
| an `active` doc past `stale_after_days`       | propose        |
| a page over the size budget                   | propose        |
| a page written in positions rather than names | propose        |

Em dashes are not on that list because no validator reports them. They are a
stylistic preference, they come out at [step 6](#6-the-unslop-pass), and a
validator is for rules with a decay argument behind them.

The line is whether fixing it needs to know something the file does not say. A
missing `parents` entry is derivable from the other end of the edge. Whether
"currently" is still true is a fact about the system, and the page is the thing
whose truth is in question, so it cannot be the evidence.

`docs-freeze` and `guard-generated` are not part of this. Both are outside the
umbrella and both are about a change rather than about the repository as it
stands. Why is in
[where the rules are enforced](../doctrine.md#where-the-rules-are-enforced).

### 2. The drift worklist

```
bunx wiki-drift
```

It takes the names off each page, finds the files holding those names today,
and asks which of them were committed after the page's `last_updated`. The
output is ordered by how much moved. Work down it.

**It orders review; it does not claim coverage.** Each entry says why it is
there, and the two reasons mean different things:

- **churn**: the files under this page's names moved. The page may be fine, but
  something it describes was edited after it last claimed to be current, and it
  is the best-evidenced thing to reread today.
- **untraceable**: nothing could be grepped, and the page is older than the
  review threshold. Either it has no names, which is the ordinary shape of a
  page about a convention or a legal position, or its names are gone from the
  repository, which is either staleness or a rename. The run cannot tell which,
  and neither can you until you read the page.

A page that comes back quiet has had the files its names live in checked
against the date it declares. That is the whole of the claim, and it is worth
being precise about, because the failure mode of a heuristic is a reader who
believes it was a proof.

There is no `watch_paths` key, and there was never going to be one. The design
document offered pages that escape hatch and the frontmatter contract is closed
at five keys, so it would have been an error by a rule that predates it. It is
also a list of positions, which
[names and positions](../doctrine.md#names-and-positions) bans in prose
precisely because a stale one points nowhere. Putting them in frontmatter,
where only a tool would ever read them, moves the decay to the one place no
reader passes. **A page that needs to pin a file cites it in the body**, where
a reader sees it, and `wiki-drift` reads a cited path as a name of its own kind.
Where a project sets `wiki.path_citations: forbidden` that option is gone by
the project's own choice, and those pages are traced by their names or surfaced
on age.

### 3. Reread what the worklist queued

Against the code, not against memory. Then:

- Rewrite what drifted and bump `last_updated`. The rules for the page are
  [wiki-authoring](../wiki-authoring/SKILL.md)'s, and they do not relax for a
  sweep.
- **Propose substantive rewrites, do not commit them silently.** A mechanical
  fix is one nobody needs to review. A rewritten explanation is a claim about
  how the system works, made by whoever swept rather than by whoever built it.
- Where the page is right and the worklist was wrong, say so and move on. A
  heuristic that is never wrong is a heuristic that is not looking.
- Where a page turns out to describe something that no longer exists, it is a
  deletion, and deletions are proposed. A page removed in a sweep is the one
  edit nobody will find later by grepping for what it said.

### 4. Coverage gaps

Enumerate the names the repository actually has, and diff them against the
names the wiki mentions. Workspace names from the package manifests, service
and stack names from the deployment configuration, table names from the
migrations, top-level directories under the source root.

What is missing is a **candidate** gap. Report it, never fill it. A subsystem
with no page may be undocumented, or it may be a thing nobody needs a page
about, and only somebody who knows the project can tell those apart. Filling
them automatically is how a wiki acquires forty pages that say nothing and one
reader who stops trusting it.

This step is deliberately not a bin. The extractors are per-repository, and
declaring them in the profile is
[deferred](../doctrine.md#where-the-rules-are-enforced) until the manual
version has been run enough times to know what is worth declaring.

### 5. The docs sweep

```
bunx docs-validate
```

Two findings need a decision rather than an edit:

- An **`active` doc past `stale_after_days`** is shipped, folded, or killed.
  Those are the three options and there is no fourth. An active document is
  live progress prose, which is correct while the work is open and wrong the
  moment it closes, and nothing about the filename marks that transition. The
  reasoning is in
  [the lifecycle contract](../doctrine.md#the-lifecycle-contract).
- A **`shipped` doc missing `folded_into`** is folded now. Shipping is the only
  moment folding reliably happens, and a document that got past it is one the
  gate missed rather than one that was exempt.

Shipping a document is [project-docs](../project-docs/SKILL.md)'s procedure,
including the `docs-freeze` run that writes the body hash. Do not hand-write
that key.

### 6. The unslop pass

Over pages touched in this sweep, and only those. A sweep that rewrites the
prose of every page it did not otherwise need to open produces a diff nobody
can review and a `last_updated` on every page that is a lie about when it was
last thought about.

Em dashes come out here rather than in a validator, because it is a stylistic
preference and a validator is for rules that have a decay argument behind them.
The rest of the pass is the project's own voice, which lives in `PRINCIPLES.md`
or `wiki-principles.md` at the wiki root. See
[fixed versus project-local](../doctrine.md#fixed-versus-project-local).

### 7. Report

Four things, and the fourth is the one that gets dropped:

- **What changed**, and where. Mechanical fixes can be listed in a line.
- **What was proposed and not applied**, each with what it is waiting on. This
  is the sweep's real output. A proposal nobody records is a proposal nobody
  acts on, and next fortnight's sweep will find it again and propose it again.
- **The coverage gaps**, as candidates.
- **What was skipped, and why.** A sweep that ran out of time in the middle of
  the worklist is a normal outcome. A sweep that says it swept is not.

The report goes where the finish note goes, which
[task-tracking](../task-tracking/SKILL.md) decides. A sweep is a task: it has a
tracker entry, and its evidence is the runs above and their counts.

## Finish

```
bunx project-validate
```

Exit 0. If this package is the repository you are in rather than a dependency
of it, the bins are not on the path and the same runs are
`bun run skills/bin/<name>.ts`.

Stop if you catch yourself thinking:

- "The worklist is empty, so the wiki is current." It is empty of pages whose
  names moved. A page whose subject changed without any of its names changing
  is exactly what the worklist cannot see, and it says so in every run.
- "This page is obviously stale, I will just rewrite it." Then you are making a
  claim about how the system works today, on a page you opened because a grep
  said its neighbours had changed. Read the code first, and propose the rewrite.
- "I will fill in the coverage gaps while I am here." Those are candidates. A
  page written by whoever noticed the gap, rather than by whoever knows the
  subject, is the kind of page a reader learns to skip.
- "I will bump `last_updated` on everything I looked at." The date says when
  the page was last checked against reality, and a page you skimmed while
  scrolling past is not one you checked. Bump what you read.
- "The validators pass, so there is nothing to sweep." The validators check
  shape. Every rule in this system that is about truth rather than shape is
  enforced here, by somebody reading, which is why this fires on a calendar.
