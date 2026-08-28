---
title: Drift detection
parents: [README]
children: []
related_pages: []
last_updated: 2026-08-28
---

The housekeeping sweep needs a list with an end, and `wiki-drift` is what
produces one. It enforces nothing. It answers what to read next.

`scanDrift` is the run. `extractNames` takes the names off a page,
`buildWorklist` indexes them against the repository, and the pages come back
ordered by how much moved under them.

**A page written in positions is invisible to this.** A stale name still points
somewhere and can be traced; a stale line number points nowhere. That is the
second half of why the position bans exist, and the half that gets missed.

The measure of the extraction is what it throws out. `MAX_NAMES_PER_PAGE` caps
what one page contributes and `MAX_FILES_PER_NAME` drops a name found in too
many files, because a token in three hundred files is a word, and one word at
the top of an ordered worklist is what makes the order worthless. Every drop is
reported, since a real name dropped is a page that looks traced and is not.

A `DriftReason` says why a page is queued, and the run says, for every page,
which of two things it did. Where names were traced, the page is ordered by
what changed under them since its `last_updated`. Where a page has nothing
greppable at all, which is the ordinary shape of one about a convention or a
legal position, it is surfaced on age instead, against `DEFAULT_AGE_DAYS`.
Ordering by age is the worse answer of the two and the run says so, because a
heuristic a reader mistakes for a proof is worse than no heuristic.

A page with nothing greppable that is younger than `DEFAULT_AGE_DAYS` is a
third case rather than a variant of the second. It is neither traced nor
surfaced, so nothing about it has been checked against anything, and the
summary counts it apart from the traced pages instead of inside them. That
window is the one where the page was just written and the count is most
readily believed.

The other half of the sweep, diffing the names a repository has against the
names its wiki never mentions, stays manual. Enumerating them well means
knowing where a given repository keeps its service names, its table names and
its workspaces, and a profile block declaring per-repository extractors waits
until the manual version has run often enough to say what is worth declaring.
