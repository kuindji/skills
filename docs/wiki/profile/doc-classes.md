---
title: Document classes
parents: [profile]
children: []
related_pages: [validators/docs-checks]
last_updated: 2026-08-29
---

A document's rules follow its class, and a class is a selector somebody wrote
down rather than a place a file sits. `DOC_CLASSES` names the seven:
`lifecycle` for specs and plans, `live` for READMEs and roadmaps, `tracker` for
the in-repo backend, `checklists` for append-only evidence, `reference` for
material dated by its own content, `assets` for what is not validated, and
`ignored`, which is a class rather than an exemption so that a deliberate
exclusion is a line somebody wrote instead of a silence.

`classifyDocPaths` matches every file under the documents root against the
declared selectors. **Exactly one class, always.** No match is an error,
because a stray dated plan landing outside the declared globs would otherwise
escape naming, freezing and the fold gate together. Two matches are an error
as well, since a file that is both `reference` and `lifecycle` has no answer to
what its rules are.

A selector resolves against the documents root. A leading slash makes it
repository-root-relative instead, which is how a front-door README gets a class
without being moved under the documents directory.

`classifyDocPaths` also checks the selectors in the other direction. A literal
path that names no file is an error because it promises one specific document.
A wildcard that matches no file is a warning because it describes a family
that may legitimately be empty. The distinction follows the wildcard syntax
understood by `Bun.Glob`, including escaped special characters.

Three things under a documents root are exempt, each for its own reason.
Anything under the declared wiki root, whose pages answer to `wiki-validate`
instead and whose root often sits inside the documents root. A profile, which
is configuration rather than a document, and which the recommended layout puts
at each product's documents root. And a file already claimed by a profile
closer to it, which is how a product documents root nested inside the
repository's stays classified from one place rather than two.

`checkTrackerCovered` closes the loop from the other side. Where the backend is
in-repo, the file the profile names as the tracker has to be matched by a
`tracker` glob, or none of the tracker rules run over it and nothing says so. A
gitignored tracker is unreachable the same way, since the rules run over the
files git can see.

The class runs in the other direction too. Declaring `tracker` globs under an
external backend is `docs.trackerClass`, because a file in the repository
carrying task state would be a second authority, and declaring them where the
profile names no tracker at all is the same error with a different reason: the
class would mark a file as the authority for a fact this repository decided not
to keep.

What each class then costs its documents is in [[validators/docs-checks]].
