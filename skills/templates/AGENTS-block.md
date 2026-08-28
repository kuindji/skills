# The AGENTS.md block

`AGENTS.md` at the repository root is where this system starts, because it is
the one file every agent reads without being asked. Everything else here is
reached through it.

Paste the block below into `AGENTS.md`, then edit the paths so they match this
repository. Keep it short: a block that grows into a second copy of the rules
is a second authority, and the copy that gets read first wins. It is a set of
pointers, and the pointers are the point.

If this project uses `CLAUDE.md` as well, have it read `AGENTS.md` rather than
repeating any of this.

````markdown
## Project rules

Read before changing anything in this repository.

- **House rules**, this project's own: `docs/house-rules.md`
- **Profile**, which configures everything below: `project-profile.yaml`. It
  names the wiki root, the document classes, where task state lives, which
  paths are generated, and which paths are held to mature ceremony.
- **Shared skills**: `node_modules/@kuindji/project-skills/skills/`
- **Tracker**: the file `tracker.file` names, or the board `tracker.project`
  names inside the system `tracker.backend` declares. It is the only authority
  on what is intended and whether a piece of work is done, so no other file
  here narrates that.

Resolve the profile that governs the path you are about to touch before you
start, and say which product and which mode you resolved. A wrong reading
surfaces in the first line instead of in the diff.

| Do this                                     | Read this                                                             |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Write or edit a wiki page                   | `node_modules/@kuindji/project-skills/skills/wiki-authoring/SKILL.md` |
| Write a spec, plan or handover, or ship one | `node_modules/@kuindji/project-skills/skills/project-docs/SKILL.md`   |
| Start a task, update one, or finish one     | `node_modules/@kuindji/project-skills/skills/task-tracking/SKILL.md`  |
| Ask why a rule exists at all                | `node_modules/@kuindji/project-skills/skills/doctrine.md`             |

Before claiming any of it is done:

```
bunx project-validate
```

Exit 0, or it is not done. `bunx wiki-validate`, `bunx docs-validate` and
`bunx profile-validate` run the same checks one at a time. The write guard,
`bunx guard-generated`, judges a change rather than the repository, so it runs
where the change is.
````
