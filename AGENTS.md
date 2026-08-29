# AGENTS.md

This repository is the skills package, and it is also a consumer of itself.
The block below is `skills/templates/AGENTS-block.md` with the paths edited to
match, which is what a consuming repository is expected to do with it.

## Project rules

Read before changing anything in this repository.

- **House rules**, this project's own: `docs/house-rules.md`
- **Profile**, which configures everything below: `project-profile.yaml`. It
  names the wiki root, the document classes, where task state lives, which
  paths are generated, and which paths are held to mature ceremony.
- **Skills**: `skills/`. They live here rather than under `node_modules`,
  because this is the package.
- **Tracker**: the file `tracker.file` in the profile names. It is the only
  authority on what is intended and whether a piece of work is done, so no
  other file here narrates that.
- **Recording**: every task in this repository is recorded in the tracker. That
  is this repository's own rule and it lives here rather than in the profile,
  because no validator can check whether an agent volunteered a tracker write.
  Elsewhere the default holds: an agent records work when it is asked to, or
  when a Taskflow `tracker-ref` names the item.

Resolve the profile that governs the path you are about to touch before you
start, and say which product and which mode you resolved. A wrong reading
surfaces in the first line instead of in the diff.

| Do this                                     | Read this                        |
| ------------------------------------------- | -------------------------------- |
| Write or edit a wiki page                   | `skills/wiki-authoring/SKILL.md` |
| Write a spec, plan or handover, or ship one | `skills/project-docs/SKILL.md`   |
| Start a task, update one, or finish one     | `skills/task-tracking/SKILL.md`  |
| Sweep the wiki and docs, on a cadence       | `skills/housekeeping/SKILL.md`   |
| Ask why a rule exists at all                | `skills/doctrine.md`             |

Before claiming any of it is done:

```
bun test && bun run type-check && bun run format && bun run validate
```

The validators are not on the path here, because this package is not a
dependency of itself. `bun run validate` is `project-validate`; the others are
`bun run skills/bin/<name>.ts`.
