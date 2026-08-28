---
title: Adopting the package
parents: [README]
children: []
related_pages: []
last_updated: 2026-08-28
---

Nothing here goes to a registry. A consuming repository takes
`@kuindji/project-skills` as a bun development dependency by git URL, pinned to
a tag, so an upgrade is an
edit somebody made rather than whatever the default branch held on the morning
they installed. The manifest ships the source root alone, so what arrives is
the four skills, the doctrine they link into, the templates, the library and
the bins, and none of this repository's own documents.

What happens next splits in two, and the split is the thing to understand.
**The rules are installed, and the templates are copied.**

## Installed

The skills and the doctrine are read where they sit inside the installed
package. A consuming repository keeps no copy of them, so a rule that changes
arrives with a version bump rather than a merge, and no repository can run a
fork of the rules while believing it runs these. It is also why the skill
contract in [[skills]] is checked by this package's own tests and not by a bin:
a consumer has nothing local for a bin to read.

The seven bins in [[validators]] are declared in the manifest, so a consumer's
package runner puts each of them on the path under its own name and
`project-validate` is a word somebody can type. Inside this repository they are
not on the path, because a package is not a dependency of itself. Every command
in every skill is written in both forms for that reason, and the second form is
the one this repository runs.

## Copied

Six files leave the package and belong to whoever copied them: the root
profile, a product profile where a repository holds more than one product, the
tracker where task state lives in the repository rather than on a board, the
house rules, the wiki principles, and the block that goes into the repository's
agent instructions. Each opens with a header saying where it goes and what to
edit. `TEMPLATE_PATH` is where the root profile is copied from, written as the
dependency path a consuming repository sees rather than as a path inside this
one, and a test keeps it pointing at a file that ships: it is the one string
here that a repository with no profile at all is told to go and read.

A copied file is never updated from here again. That is the trade, and it is
the same line the doctrine draws between what is fixed and what a project owns:
a rule a validator enforces stays in the installed half, where it cannot be
edited into something else, and everything a validator cannot check is copied,
where it can be made to fit a repository that does not resemble this one.

## The entry point

The agent instructions file at the repository root is where the system starts,
because it is the one file every agent reads without being asked. The block
pasted into it names the profile, the house rules and the tracker, and maps a
moment to the skill that governs it: writing a page, shipping a document,
starting a task, sweeping on a cadence.

It points and does not restate. A block that grows into a second copy of the
rules is a second authority, and which copy is true depends on which one the
reader opened.

## What adoption is finished by

One profile, at minimum, and `project-validate` exiting zero over the
repository. `profile-validate` is the narrower first run, because until a
profile parses nothing else has anything to read: every rule below it comes out
of that file rather than out of a default.

This repository is its own first consumer, so the templates are exercised the
only way a template honestly can be, by copying them into a scratch repository
and running the rules there. That test, and the rest of what stands between a
change here and a claim that it works, is in [[testing]].
