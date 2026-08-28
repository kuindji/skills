---
title: The skills package
parents: []
children: [profile, validators, skills, drift, testing]
related_pages: []
last_updated: 2026-08-28
---

This repository is a package of agent skills and the validators that make them
checkable. A consuming project installs it, copies a handful of templates,
declares one profile, and from then on an agent writing a wiki page, a spec or
a tracker entry has both an instruction to follow and a command that says
whether it followed.

Two halves. The prose half is four skills and the doctrine file they all link
into. The code half is seven bins over a library. The prose is what an agent
reads and the code is what a build runs, and neither restates the other: a rule
an agent can break silently lives in the code, and a rule no program can check
lives in the prose.

The package is also its own first subject. Its profile, its tracker, its specs
and this wiki are the corpus every validator is exercised against, which is why
`path_citations: forbidden` applies here and no page below names a file by its
path.

Where to go:

- [[profile]] answers what configures all of this, and how a path resolves to
  the product whose rules govern it.
- [[validators]] answers what each bin judges and what they share.
- [[skills]] answers what an agent is told, and what a project owns instead of
  being told.
- [[drift]] answers how the wiki gets ordered by what moved under it.
- [[testing]] answers how this repository checks itself, and what the fixtures
  cover that it cannot.
