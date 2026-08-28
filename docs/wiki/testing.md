---
title: How this repository checks itself
parents: [README]
children: []
related_pages: []
last_updated: 2026-08-28
---

Four commands stand between a change and a claim that it works: the test suite,
the type check, the formatter, and the umbrella validator. The bins are not on
the path here, because this package is not a dependency of itself, so each of
them runs through its own entry point under the package root.

**This repository is the first subject of its own rules.** Its profile, its
tracker, its specs and this wiki are the corpus the validators are exercised
against, and `project-validate` exiting zero over it is the acceptance gate for
the whole build. A validator whose author could not write a passing page
against it is not finished, which is the reason this wiki exists at all.

Two kinds of test carry that. Unit tests cover each rule against constructed
input, where a case can be made exact. The dogfood tests run the real rules
over this real repository, so a rule that passes against constructed input and
fails against the thing it was written for is caught in the same run: the
skills are checked against the skill contract, the profile against the schema,
the documents against their classes, and the templates by copying them into a
scratch repository the way each template's own header says to.

**The hard shapes arrive as fixtures rather than as adoption.** This repository
is the simplest shape the schema supports: one product, no owners block, an
in-repo tracker, one wiki profile. Two fixture repositories cover the rest. A
multi-product one carries an owners block with a complement default, shared
packages and per-product roadmaps. A mature single-product one carries dual
wiki profiles, an external tracker and no roadmap. Both are nested
repositories, so every run over this one skips them as boundaries and names
them while doing it, which exercises the boundary rule as a side effect of
existing.

A schema hardened only against the repository that wrote it would fit only that
repository. The fixtures are what stops the simplest shape from being the only
one that passes.
