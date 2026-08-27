# Tasks

The tracker for this repo. `tracker.backend: in-repo` in `project-profile.yaml`
points here, which makes this file the sole authority for task state. No other
file carries it. A task moves to Done only with an `evidence:` line naming the
command that proves it.

Ids are `<stage><n>`, stages following the build order in the design spec.

## Todo

- [ ] `P1-01` Profile schema and parser
- [ ] `P1-02` Doc-class resolution, including no-match-is-an-error
- [ ] `P1-03` Owner resolution: `.agent-owner`, then `git rev-parse --git-common-dir` basename
- [ ] `P1-04` Path-to-product index, non-overlap checking
- [ ] `P1-05` Profile fixtures for BearingKind and TheFloorr shapes
- [ ] `P2-01` `wiki-validate`: carried-over graph rules
- [ ] `P2-02` `wiki-validate`: position bans and `path_citations` policy
- [ ] `P2-03` `docs-validate`: lifecycle class
- [ ] `P2-04` `docs-validate`: live, tracker and no-class-match
- [ ] `P2-05` `docs-freeze`
- [ ] `P2-06` `guard-generated`
- [ ] `P2-07` `project-validate` umbrella
- [ ] `P3-01` `doctrine.md`
- [ ] `P3-02` `wiki-authoring` SKILL.md
- [ ] `P3-03` `project-docs` SKILL.md
- [ ] `P3-04` `task-tracking` SKILL.md
- [ ] `P3-05` Templates
- [ ] `P4-01` `housekeeping` SKILL.md and the sweep
- [ ] `P5-01` Write this repo's `docs/wiki/`
- [ ] `P5-02` Acceptance: `project-validate` exits 0 on this repo

## In progress

## Blocked

## Done

- [x] `P0-01` Design spec, two gpt-5.5 review rounds
      evidence: docs/specs/2026-08-27-project-management-skills-design.md, commits 81fa509..52d8ad5
