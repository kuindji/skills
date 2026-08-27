# Tasks

The tracker for this repo. `tracker.backend: in-repo` in `project-profile.yaml`
points here, which makes this file the sole authority for task state. No other
file carries it. A task moves to Done only with an `evidence:` line naming the
command that proves it.

Ids are `<stage><n>`, stages following the build order in the design spec.

## Todo

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

- [x] `P2-02` `wiki-validate`: position bans and `path_citations` policy
      evidence: bun test skills/lib/wiki — 104 pass. Calibrated against the real
      corpora: 200 line-number errors on 21 of TheFloorr's 152 pages, matching an
      independent grep of the same pattern exactly, and 1105 path references on
      107 pages reported as a count because that project sanctions them; 50
      path-citation errors on Riskore, which forbids them; the tree rule verified
      against a real 31-row tree in BearingKind's APP_ARCHITECTURE.md.
      Measuring, rather than guessing, is what found every false positive: the
      first version masked inline code and so saw 7 of the 200 line numbers,
      because 1065 of 1100 path references in that wiki live inside backticks.
      gpt-5.5 review found five more, all reproduced before fixing.
- [x] `P2-01` `wiki-validate`: carried-over graph rules
      evidence: bun test skills/lib/wiki — 56 pass; and against the corpus it was
      carried over from, 152 pages and 0 errors, the same counts TheFloorr's own
      validator reports. The three BearingKind wikis, which never ran it, each
      report 8 errors, including a `dear-child` placeholder committed as a README
      child. Reviewed by gpt-5.5; its one reproducible finding, a
      `business_subtree` written with a trailing slash silently disabling the
      self-containment rule, is fixed and covered.
- [x] `P1-07` Repo-root files: root-relative globs, a leading / matches from the repo root
      evidence: bun test skills/lib/docs — README.md classifies as live
- [x] `P1-06` Dead-glob detection
      evidence: bun test skills/lib/docs — caught `plans/*.md` and the dead `live: [README.md]` in this repo's own profile
- [x] `P1-05` Profile fixtures for BearingKind and TheFloorr shapes
      evidence: bun test skills/lib/fixtures — 10 pass
- [x] `P1-04` Path-to-product index, non-overlap checking
      evidence: bun test skills/lib/profile/index.test.ts — 10 pass
- [x] `P1-03` Owner resolution: .agent-owner, then git rev-parse --git-common-dir basename
      evidence: bun test skills/lib/profile/owner.test.ts skills/lib/profile/clone.test.ts — 17 pass, incl. a real linked worktree
- [x] `P1-02` Doc-class resolution, including no-match-is-an-error
      evidence: bun test skills/lib/docs — 14 pass; first run against this repo flagged docs/house-rules.md as unclassified
- [x] `P1-01` Profile schema and parser
      evidence: bun test skills/lib/profile — 17 pass, includes parsing this repo's own project-profile.yaml
- [x] `P0-01` Design spec, two gpt-5.5 review rounds
      evidence: docs/specs/2026-08-27-project-management-skills-design.md, commits 81fa509..52d8ad5
