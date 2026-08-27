# @kuindji/project-skills

Shared project-management rules for agents, consumed as a bun git dependency by
TheFloorr, Riskore, Vigilocity and BearingKind. Readable by Claude Code, by
Codex, and by people.

It answers one question in five places: **what is the decay rate of this
sentence, and what invalidates it.** Wiki, docs, tracker, checklists and code
each have a different answer, and every rule here derives from one of them.

Status: design complete, nothing implemented. Start at
[`docs/specs/2026-08-27-project-management-skills-design.md`](docs/specs/2026-08-27-project-management-skills-design.md).

## Layout

| Path | Holds |
| --- | --- |
| `skills/` | `SKILL.md` files. Markdown only, never executable code. |
| `templates/` | Files copied into a consuming repo, then owned and edited there. |
| `src/` | All executable code, including every declared bin. |
| `docs/specs/` | Dated design documents. Frozen once shipped. |
| `docs/wiki/` | How the system works now. Empty until milestone 1. |

## This repo follows its own rules

`project-profile.yaml` at the root configures this repo the way a consuming repo
would be configured. Its validators are meant to pass here first.
