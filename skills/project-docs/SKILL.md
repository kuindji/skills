---
name: project-docs
description: Use when writing or editing a spec, plan, research note or handover, when adding any file under a project's docs root, when work closes and its document has to ship, when editing a document that already shipped, or when docs-validate or docs-freeze reports a class, naming, frontmatter, fold-gate, freeze or review-age problem.
---

# Project docs

A document answers **what we decided, and when**. Once it ships it is frozen at
its date, and the date is the disclaimer that keeps it honest for as long as
anyone reads it. Before it ships it carries none of that protection: it is
present-tense prose with no visible date, which is the dangerous kind. The
reasoning is in [the spine](../doctrine.md#the-spine) and
[one authoritative home per fact](../doctrine.md#one-authoritative-home-per-fact).

A document is the wrong home for what is true now, which is the wiki's, for
what is intended or done, which is the tracker's, and for what was observed on
one build, which is a checklist row. Writing any of those here creates a second
authority that nothing keeps in step.

## Read before writing

1. Resolve the profile that governs the path, by the rule in
   [finding the profile](../doctrine.md#finding-the-profile-that-applies), and
   say which one out loud. Take `docs.root`, the class globs,
   `stale_after_days` and `review_after_days` from it.
2. Resolve the mode of the path and say it out loud. Mode decides whether the
   document has to exist at all: greenfield expects a numbered plan before the
   code and a spec per subsystem, mature makes the ticket the unit and asks for
   a spec only when a change cuts across. The table is in
   [mode](../doctrine.md#mode).
3. Decide the class before you decide the filename, and check that a glob in
   the profile already covers where the file will land. A file under the docs
   root matching no class is an error, and adding the glob afterwards is how a
   dated plan ends up in a directory where nothing checks it.

## Class first

Nothing about a document is decided by the directory it sits in. Everything is
decided by the class its path matches, which is why the class is the first
choice and the hardest to change later. The reasoning is in
[documents have classes, not locations](../doctrine.md#documents-have-classes-not-locations).

| Class        | Holds                             | Named                 | Aged by                                | Frozen |
| ------------ | --------------------------------- | --------------------- | -------------------------------------- | ------ |
| `lifecycle`  | specs and plans                   | `YYYY-MM-DD-topic.md` | `stale_after_days`, while it is active | yes    |
| `live`       | README, roadmap, house rules      | free                  | `review_after_days`, always            | no     |
| `tracker`    | the in-repo tracker file, only it | free                  | no                                     | no     |
| `checklists` | append-only evidence              | free                  | no                                     | no     |
| `reference`  | research, policies, legal         | free                  | no                                     | no     |
| `assets`     | anything that is not prose        | free                  | no                                     | no     |
| `ignored`    | deliberate exclusions             | free                  | no                                     | no     |

Every file under the docs root matches exactly one. No match is an error, two
matches are an error, and a glob that matches nothing is a warning worth acting
on because it reads as coverage and provides none. Three things under the root
are exempt and need no class: the wiki root, which answers to `wiki-validate`
instead, a `project-profile.yaml`, which is configuration, and a file a nearer
profile already classified. A glob written with a leading `/` is
repo-root-relative, which is how a front-door `README.md` gets a class without
moving under the docs root.

The choice that actually costs something is `lifecycle` against the rest. A
document belongs in `lifecycle` when it records a moment and then stops being
edited: a decision, a plan for work that will finish. It belongs in `reference`
when its own content carries its date, as a research report or a policy does,
and in `live` when it claims to describe the present. Only `lifecycle` is
date-named, staleness-checked, gated on folding and frozen. Putting a permanent
document there makes it a violation on the day it is written.

## The lifecycle document

The filename carries a real calendar date: `2026-08-27-pricing-migration.md`.
The date belongs where a directory listing, a git log and a link all show it,
and sorting by name then sorts by decision order.

```yaml
---
type: plan
status: active
---
```

`type` says what kind of document this is, in your own words: `spec`, `plan`,
`research`, `handover`. `status` is one of three, in order.

- `draft` while it is being written.
- `active` while the work it describes is open. Committing the document is what
  says the work is still moving, and `stale_after_days` without a commit warns
  that it probably closed without anyone saying so. That silent close is the
  failure the whole class exists to catch.
- `shipped` once the work closed, the content was folded, and the body is
  frozen.

Keep the block to plain keys and short values. A tab used for indentation and
an unquoted value carrying a colon both leave it unparseable, and so does a
flow collection split over several lines, which is valid YAML that the parser
here refuses: write a long `folded_into` on one line, or as an indented block
list. Nothing in a block that does not parse can be read, so the validators
report the block as unreadable rather than listing the keys it holds as absent.

## Shipping

Two steps, in that order, because the second one records that the first
happened.

**Fold first.** Read the document against the wiki and move what is still true
into pages, following [wiki-authoring](../wiki-authoring/SKILL.md). Then set
`status: shipped` and list the slugs you wrote into:

```yaml
folded_into: [services/pricing, business/rate-table]
```

Every slug has to resolve to a real page, which is what stops the list being a
gesture. Shipping is the only moment at which folding reliably happens, so a
document that ships unfolded leaves its durable knowledge somewhere nobody
reads again, going stale where no rule can see it.

**Then freeze.**

```
bunx docs-freeze docs/specs/2026-08-27-pricing-migration.md
```

Name the path. A bare `docs-freeze` sweeps the lifecycle documents and passes
over in silence the ones that have not shipped and the ones carrying no
frontmatter at all, which is right for a release closing several at once and
unhelpful when you are shipping one. It still reports frontmatter it cannot
read, because it cannot tell from that whether the document shipped. Named, it
tells you why it refused. `--dry-run` prints what it
would write.

It writes `frozen_body_sha256`, and the only other key it touches is a
`reopened_reason` it has just spent. It does not set `status` and it does not
write `folded_into`, because deciding that work is done is not a mechanical
step. It reads the repository as git sees it, so a document inside
an ignored directory is not there to be frozen. And it refuses rather than
guesses, naming the cause: a path that names no file git can see, a document
whose class is not `lifecycle`, one with no frontmatter or with frontmatter
that does not parse, one that has not shipped, one with no body below its
frontmatter, one already frozen whose body has moved, and one whose
frontmatter defines a YAML anchor on a key the freeze would have to rewrite,
where deleting the key would leave every alias to it dangling.

## What the freeze costs afterwards

The hash covers the body below the frontmatter, with line endings normalised
and trailing whitespace stripped. A formatting sweep, a frontmatter edit and a
`folded_into` update after a slug rename are therefore all legal. Reflowing a
paragraph is not, and neither is anything else that changes the prose. That is
the line the freeze draws.

Changing a frozen body needs a record of why, in the frontmatter:

- `supersedes:` naming a later lifecycle document in this repository, by path or
  by filename. It has to exist and be dated no earlier than this one. An edit
  excused by a document that does not exist is an unexplained edit, and it
  exempts this one from the freeze forever.
- `reopened_reason:` saying what reopened the decision. Then
  `bunx docs-freeze --refreeze <path>` moves the hash and removes the reason,
  because the reason is spent by the freeze it excused. Leaving it in place
  would exempt the document from every later edit, silently.

Reopening is allowed. Reopening silently is not, and the difference is one
frontmatter key.

## The classes that are not frozen

`live` is the one to watch, and it is more dangerous than a stale plan rather
than less: a README claims to describe today and is believed as one. Nothing in
its prose can say when it was last true, so the only signal is when anyone last
committed it, and past `review_after_days` that is a warning asking someone to
look. Read it against what is true now. Correct what has drifted, or commit it
unchanged to record that it was checked. If nothing in it describes the
present, it belongs in `reference`.

`reference`, `checklists` and `assets` carry no rules beyond having a class.
`ignored` is a class rather than an exemption, so that a deliberate exclusion is
a glob somebody wrote down instead of a silence.

`tracker` names the in-repo tracker file and nothing else, and only where the
backend is in-repo: declared against an external tracker it says somebody
believed task state lived here. A second file classified there is a second
authority for task state, and the tracker under any other class would go
unchecked, so both directions are errors. What belongs inside the file is
`task-tracking`'s subject, not this one.

## Finish

```
bunx docs-validate
```

Exit 0, or the document is not written. If this package is the repository you
are in rather than a dependency of it, the bin is not on the path and the same
run is `bun run skills/bin/docs-validate.ts`. Warnings do not fail the run and
are still findings: a stale `active` document is work that closed without saying
so, and a `live` document past its review age is a page somebody is believing
right now. One warning is about the repository rather than about any document:
in a shallow clone the commit dates are truncated, so staleness and review age
cannot be measured at all. A CI checkout defaults to a depth of one, and
fetching the full history where the check runs is the fix.

Stop if you catch yourself thinking:

- "I will add the glob once the file is written." Then the file is an error
  from the moment it lands, and the glob is where you choose which rules it
  answers to. Choose first.
- "I will fold it into the wiki in a follow-up." Then it never happens.
  Shipping is the moment, which is why the gate sits there and not somewhere
  more convenient.
- "It is a small edit to a shipped spec." Size is not what the freeze measures.
  Say why it moved, or do not move it.
- "This document is a bit of both classes." Two classes mean two sets of
  obligations and nothing to decide between them, which is why it is an error.
  Split the document or pick the narrower class.
- "Nobody has touched this plan in months, so it must be finished." Then ship
  it: fold it, and say so in `folded_into`. An `active` document that is quietly
  finished is exactly what the staleness warning is pointing at.
