# @kuindji/project-skills

Shared project-management rules for agents, consumed as a bun git dependency by
a handful of private repositories: a mature commerce monorepo, a four-product
mobile monorepo, and two smaller single-product repos. Readable by Claude Code,
by Codex, and by people.

It answers one question in five places: **what is the decay rate of this
sentence, and what invalidates it.** Wiki, docs, tracker, checklists and code
each have a different answer, and every rule here derives from one of them.

Status: design complete, nothing implemented. Start at
[`docs/specs/2026-08-27-project-management-skills-design.md`](docs/specs/2026-08-27-project-management-skills-design.md).

## Layout

`skills/` is the source root. It is what another project would call `src/`, named
for what it holds, because here the skills are the product. `docs/` is
information about that product.

| Path                         | Holds                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `skills/<name>/SKILL.md`     | A skill. The `SKILL.md` is what makes it one.         |
| `skills/templates/`          | Files copied into a consuming repo, then owned there. |
| `skills/lib/`, `skills/bin/` | Implementation and entry points.                      |
| `docs/specs/`                | Dated design documents. Frozen once shipped.          |
| `docs/wiki/`                 | How the system works now. Empty until milestone 1.    |

## This repo follows its own rules

`project-profile.yaml` at the root configures this repo the way a consuming repo
would be configured. Its validators are meant to pass here first.
