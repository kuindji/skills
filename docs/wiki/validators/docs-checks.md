---
title: How documents are checked
parents: [validators]
children: []
related_pages: [profile/doc-classes]
last_updated: 2026-08-28
---

`validateDocs` classifies first and then runs the rules of each class over what
the classification produced. Nothing is judged before it has a class, which is
what [[profile/doc-classes]] describes.

`validateLifecycleDocs` covers the one class with a life. `STATUSES` is three
words in order: a `draft` is being written, an `active` document describes work
in progress, and a `shipped` one is closed. A lifecycle document is date-named
and carries that date in its frontmatter. An active one is flagged once it goes
`stale_after_days` without a commit, because it holds live progress prose and
nothing in the filename marks the moment that prose stopped being true.
Shipping needs two things beyond the status word: `folded_into`, a list of wiki
slugs that must each resolve, and `frozen_body_sha256`.

`validateLiveDocs` covers the free-named present-tense documents, READMEs and
roadmaps, and ages them against `review_after_days`. This is the class that is
dangerous rather than wrong. It reads as true forever, and nothing in it says
when the present was.

`validateTrackerFile` reads the in-repo backend as a shape. Four level-two
sections, Todo, In progress, Blocked and Done, each appearing at most once. A
task is a top-level checkbox row under one of them, opening with an id in
backticks, and the section rather than the checkbox is what holds the state. A
Done row carries an `evidence:` line inside the indented run beneath it. Fenced
blocks and HTML comments are not state, which is how a tracker shows its own
format and how a task gets commented out rather than deleted.

Freezing is by body hash and not by git history. `normaliseBody` and `bodyHash`
take the document after its frontmatter, so a rebase, a formatting sweep or a
slug rename that forces a `folded_into` update all stay legal while the
substance stays frozen. `planFreeze` decides what a run would do and
`freezeDocs` performs it, which is why the writer is a bin of its own.

Ages come from git. `lastCommitDates` reads the last commit touching each file
and `daysSince` turns that into the number a threshold compares against.
`isShallowRepository` runs first. A shallow clone gives every file the boundary
commit's date, so the whole repository would report as churning, and a build
checks out at depth one by default.
