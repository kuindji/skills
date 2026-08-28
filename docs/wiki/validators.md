---
title: The validators
parents: [README]
children: [validators/wiki-checks, validators/docs-checks, validators/guard]
related_pages: []
last_updated: 2026-08-28
---

Seven bins, each runnable by an agent and by a build. They share a contract:
every one takes `--repo` and `--json`, and `EXIT` fixes the three codes. Zero
when nothing is wrong, one when the repository fails a rule, two when the tool
could not run at all. A warning never fails a run.

They share a harness too, in three parts. `parseArgs` reads flags against a
spec and `preflight` answers the ones every bin has before any work starts.
`loadContext` resolves the repository root, loads every profile, reports the
boundaries it skipped, and returns either a context or the reason there is
none. `report` renders diagnostics as blocks carrying a message and a remedy,
or the same set as JSON.

| Bin                | Judges                                                          |
| ------------------ | --------------------------------------------------------------- |
| `project-validate` | the umbrella: profiles, wiki and documents in one pass          |
| `profile-validate` | profile schema, product paths, owner scopes, dead patterns      |
| `wiki-validate`    | frontmatter, link symmetry, reachability, position bans         |
| `docs-validate`    | document classes, and the rules of each class                   |
| `docs-freeze`      | writes the body hash into a lifecycle document as it ships      |
| `guard-generated`  | refuses a write to generated output, or outside a clone's scope |
| `wiki-drift`       | nothing: it orders the wiki pages by what moved under them      |

**Three of the seven sit outside the umbrella, each for its own reason.**
`guard-generated` judges a change rather than a repository, so it belongs where
the change is being made and not on whatever machine runs the build.
`docs-freeze` writes, and a validator that edits files while reporting on them
is one nobody can run to find out where they stand. `wiki-drift` enforces no
rule at all. A queued page is not a fault, so it exits zero whenever it
produced a list, and putting it in the umbrella would mean failing a build over
a grep.

The three inside the umbrella are the three that judge a repository as it
stands, which is what makes one pass over them mean something.

Each of the three has its own page: [[validators/wiki-checks]],
[[validators/docs-checks]] and [[validators/guard]]. What `profile-validate`
checks is the schema described in [[profile]].
