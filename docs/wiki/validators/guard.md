---
title: Guarding writes
parents: [validators]
children: []
related_pages: [profile/owners]
last_updated: 2026-08-28
---

`guard-generated` is the one bin that judges a change rather than a repository,
and it answers a single question: may this write happen here.

Two rules meet in `guardChange`. A path matched by `generated_paths` is output,
and editing output is editing the wrong file, since the change belongs in
whatever produces it. A path outside the current clone's write scope is the
owner rule, whose two severities are on [[profile/owners]]. `writeIsAllowed` is
the verdict for one path, and `changedPaths` is how a run gets the list to
judge when it was not handed one.

`validateGeneratedPaths` runs the other direction, over the declaration rather
than over the change. A `generated_paths` pattern matching nothing in the
repository is dead, and a dead pattern is a rule everyone believes is
protecting something.

`resolveThroughLinks` and `isInside` follow every symlink before the guard
compares anything. A path can leave the repository through a link while still
reading as though it sits inside it, and a containment check on the written
string answers yes to that.
