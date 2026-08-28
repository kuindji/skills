# @kuindji/project-skills

Shared project-management rules for agents, consumed as a bun git dependency by
a handful of private repositories: a mature commerce monorepo, a four-product
mobile monorepo, and two smaller single-product repos. Readable by Claude Code,
by Codex, and by people.

It answers one question in five places: **what is the decay rate of this
sentence, and what invalidates it.** Wiki, docs, tracker, checklists and code
each have a different answer, and every rule here derives from one of them.

Status: the validators run, all four skills are written, and the templates a
project copies out of here ship. This repo's own wiki is still to come, and it
is the acceptance gate. The design is in
[`docs/specs/2026-08-27-project-management-skills-design.md`](docs/specs/2026-08-27-project-management-skills-design.md)
and the work is tracked in [`docs/tasks.md`](docs/tasks.md).

## Validators

Seven bins, runnable by any agent and by CI. Each takes `--repo <dir>`,
defaulting to the enclosing repository, and `--json`. They exit 0 when nothing
is wrong, 1 when the repository fails a rule, and 2 when the tool could not run
at all — a distinction a CI job needs, since a validator pointed at the wrong
directory is not a repository full of faults. Warnings never fail a run.

| Bin                | Checks                                                        |
| ------------------ | ------------------------------------------------------------- |
| `project-validate` | The umbrella: profiles, wiki and docs in one pass.            |
| `profile-validate` | Profile schema, product paths, owner scopes, dead patterns.   |
| `wiki-validate`    | Frontmatter, link symmetry, reachability, position bans.      |
| `docs-validate`    | Doc classes, and the rules of each class.                     |
| `docs-freeze`      | Writes `frozen_body_sha256` into shipped lifecycle docs.      |
| `guard-generated`  | Refuses edits to generated output or outside a clone's scope. |
| `wiki-drift`       | Nothing. It orders the wiki pages by what moved under them.   |

`wiki-drift` is the odd row, and it is the tool the housekeeping sweep runs on.
It enforces no rule: it takes the names off each wiki page, finds the files
holding those names today, and orders the pages by how much of that moved since
each page said it was current. A queued page is not a fault, so it exits 0
whenever it produced a list, and it stays outside the umbrella for the same
reason `docs-freeze` and `guard-generated` do.

## Layout

`skills/` is the source root. It is what another project would call `src/`, named
for what it holds, because here the skills are the product. `docs/` is
information about that product.

| Path                         | Holds                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `skills/doctrine.md`         | The rules every skill links to instead of restating.  |
| `skills/<name>/SKILL.md`     | A skill. The `SKILL.md` is what makes it one.         |
| `skills/templates/`          | Files copied into a consuming repo, then owned there. |
| `skills/lib/`, `skills/bin/` | Implementation and entry points.                      |
| `docs/specs/`                | Dated design documents. Frozen once shipped.          |
| `docs/wiki/`                 | How the system works now. Empty until milestone 1.    |

## Adopting it

Install the package, then copy four files out of `skills/templates/` and own
them: the root profile, the house rules, the wiki principles, and the block
that goes into `AGENTS.md`. Two more are conditional: `tasks.md` where task
state lives in the repository rather than in a board, and one product profile
per product where there is more than one. Each file carries its own
instructions at the top. Nothing else here is meant to be edited by a consumer,
and nothing outside those files is project-local.

## This repo follows its own rules

`project-profile.yaml` at the root configures this repo the way a consuming repo
would be configured, `AGENTS.md` and `docs/house-rules.md` are the templates
with their paths edited, and the validators are meant to pass here first.
