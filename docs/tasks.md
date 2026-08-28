# Tasks

The tracker for this repo. `tracker.backend: in-repo` in `project-profile.yaml`
points here, which makes this file the sole authority for task state. No other
file carries it. A task moves to Done only with an `evidence:` line naming the
command that proves it.

Ids are `<stage><n>`, stages following the build order in the design spec.

## Todo

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

- [x] `P2-07` `project-validate` umbrella
      evidence: bun test — 467 pass across the repo, and
      `bun run skills/bin/project-validate.ts` exits 0 here, which is the
      acceptance gate the spec sets. Six bins over one shared context: the
      umbrella reads the repository once and hands it to each check, because
      three processes would re-read it and report the same profile error three
      times. Three exit codes rather than two, since a CI job that cannot tell
      "this repo fails a rule" from "this tool was pointed at the wrong
      directory" treats the second as the first. Discovery is the part that
      needed a rule: a plain search for `project-profile.yaml` finds four in
      this repo, three of them fixture repositories, and read as products they
      would claim `apps/quiz` and `packages/notes-*` and fail this repo over
      its own test data. A nested profile that declares repo-wide settings and
      names no product is therefore a boundary, skipped with everything under
      it and named in the run's output, because a silent skip is only
      trustworthy if it says what it skipped. Probing found four faults before
      review, each now covered: a product's shipped spec was told its
      `folded_into` pages did not exist, since slugs were read per profile and
      a product may not declare a wiki; the guard refused
      `/private/var/…/repo/build/x.ts` against `/var/…/repo` as outside the
      repository, which on macOS is the ordinary form of the pre-write call it
      exists to answer; pointing any bin at a directory with no `.git` printed
      a stack trace under exit 1; and pointing one at a subdirectory silently
      measured no document age at all, because `git ls-files` answers relative
      to the subdirectory and `git log` relative to the root. Two more were
      layout faults the spec's own recommendation walked into: a
      `project-profile.yaml` sitting at a product's docs root demanded a doc
      class, and a product docs root nested inside the repo's made every
      document in it unclassified from the outside. The gpt-5.5 review found
      four more, all reproduced before fixing. The worst wrote outside the
      repository: a tracked symlink under `specs/` is a path git reports,
      classifies as lifecycle and hands to the one part of this system that
      writes, so a bare `docs-freeze` rewrote `/tmp/outside.md` and reported no
      problems. The others were a product profile silently reading as
      `in-repo` under a Linear root, since the parser documented an
      inheritance nothing performed; a `--base` ref that does not exist
      crashing instead of reporting; and a nested repository declaring only a
      tracker and a docs root being adopted as a product, which is what makes
      `tracker.backend` repo-wide enough to be refused in a product profile
      and to count as a boundary signal.
- [x] `P2-06` `guard-generated`: generated paths and clone write scope
      evidence: bun test skills/lib/guard — 58 pass; 398 across the repo. The
      rules as a library; the bin lands with the others at `P2-07`. The design
      turns on one measurement: all four `generated_paths` patterns the mobile
      monorepo declares are gitignored and have never been tracked in 701 commits, while
      more than five thousand matching files sit on disk. A guard reading a
      diff would have reported that repo perfectly clean while missing every
      path it was installed to protect, so `guardChange` takes a list of paths
      and the diff is only one caller. Owner scope needed two severities for
      the same reason. Of 701 commits, 115 span two owners, but they split:
      79 reach the default owner through a path it listed, and 36 reach it only
      through the complement, led by `bun.lock` and root `package.json`, which
      that repo's own AGENTS.md expressly permits any clone to commit. One
      severity would refuse every routine install, so an explicit claim errors
      and the complement warns. Replayed against all 701, 88.7% of real commits
      are legal from at least one clone and the 11.3% that are not are the
      cross-scope changes the rule exists for; the commerce repo reports 108
      generated touches over 23 of 800 commits, and this repo 0 over 12. Warning volume
      was measured too, and twice cut: blast-radius and unclaimed-path warnings
      are now one per change rather than one per file, after single commits
      turned up carrying 60 copies of the same sentence. Every commit now draws
      either no warning or exactly one. Probing path forms found the worst bug,
      mine: `./hasura/x.yaml` and an absolute path both walked past every rule
      in silence, which is what a pre-write hook actually passes. The gpt-5.5
      review found three more over two rounds, each reproduced before fixing
      and each fail-open: a file staged into a repo with no commits was seen by
      neither the diff nor the untracked pass, a repo declaring owners but no
      default let every unclaimed path through, and an acknowledgement written
      `/hasura/x.yaml` suppressed a refusal the same string would have earned
      as a changed path, making the escape hatch the one door that accepted a
      form nothing else did. A fourth was checked and kept as it was: a
      backslash is a legal filename character here, verified by creating such a
      file, so translating separators would misattribute a real path rather
      than fix one. Extracting the one path matcher the three path fields share
      also turned up a trailing slash silently disabling a claim, the same
      fault P2-01 found in `business_subtree`.
- [x] `P2-05` `docs-freeze`: computing and writing `frozen_body_sha256`
      evidence: bun test skills/lib/docs — 153 pass. The writer half of the
      freeze, as a library; the `docs-freeze` bin lands with the others at
      `P2-07`. It splices one key into the frontmatter rather than
      re-serialising the YAML, which would destroy comments and key order, so
      almost every risk is in the splice. Measured across five real
      repositories, all read-only and dry-run: 220 date-named documents under
      `specs/` and `plans/`, and not one carries frontmatter at all. That is
      the whole argument for the sweep swallowing `noFrontmatter` and
      `notShipped` — a first run against the business-wiki repo would print 49
      errors about documents nobody asked about, and naming a path is what
      turns the refusal back on. Probing thirteen awkward frontmatter shapes
      found that a flow collection split over several lines is valid YAML the
      parser here rejects, so the refusal now says how to rewrite it; it occurs
      in 0 of the 183 frontmatter blocks in those repos. The gpt-5.5 review
      found four more, all reproduced as failing tests before fixing, and the
      worst was mine by design: `reopened_reason` was only spent by a refreeze,
      so a document shipping with both a hash and a reason was exempt from
      every later edit forever. The other three corrupt a saved file — a blank
      line inside a block scalar ended the removal early and folded the rest of
      the prose into `status`, a deleted anchored key left its aliases
      unresolved, and a quoted `"frozen_body_sha256":` survived as a duplicate.
      An anchored key is now refused rather than rewritten: a refusal is
      recoverable and a corrupt document is not.
- [x] `P2-04` `docs-validate`: live, tracker and no-class-match
      evidence: bun test skills/lib/docs — 121 pass. Review age is calibrated
      against three real repositories: the mobile monorepo reports 26 live-shaped
      documents and none past 90 days, the business-wiki repo 17 and none,
      the commerce repo 85 and 66,
      with a median age of 214 days and the oldest at 2191. A mature repo
      producing 66 of them is why the rule warns rather than errors. The tracker
      rules pointed at real checkbox-carrying documents that are not trackers
      report 83 and 13 diagnostics, which is the measurement behind keeping them
      inside their class rather than over a docs root. Probing the parser
      against the markdown a tracker file really holds found four bypasses
      before review: fenced examples read as state, `*` and `+` rows silently
      unchecked, nested steps demanded ids of their own, and an all-indented
      file reporting nothing at all. The gpt-5.5 review found five more, all
      reproduced before fixing, and one it called a fault was kept as it was:
      evidence shown in a code block is still evidence a reader can act on.
- [x] `P2-03` `docs-validate`: lifecycle class
      evidence: bun test skills/lib/docs — 73 pass, incl. real git repositories
      built for the merge-commit, non-ASCII-path and shallow-clone cases. Against
      the mobile monorepo's per-product docs: 6 lifecycle documents found, all
      date-named, each reporting exactly one missing-frontmatter error, because
      those real specs and plans carry status in bold prose and nothing marks the
      moment they stopped being open. Against this repo: 1 doc, 0 diagnostics.
      gpt-5.5 review found three bypasses, all reproduced before fixing.
- [x] `P2-02` `wiki-validate`: position bans and `path_citations` policy
      evidence: bun test skills/lib/wiki — 104 pass. Calibrated against the real
      corpora: 200 line-number errors on 21 of the commerce wiki's 152 pages,
      independent grep of the same pattern exactly, and 1105 path references on
      107 pages reported as a count because that project sanctions them; 50
      path-citation errors on the business-wiki repo, which forbids them; the tree
      rule verified against a real 31-row tree in the mobile monorepo's wiki.
      Measuring, rather than guessing, is what found every false positive: the
      first version masked inline code and so saw 7 of the 200 line numbers,
      because 1065 of 1100 path references in that wiki live inside backticks.
      gpt-5.5 review found five more, all reproduced before fixing.
- [x] `P2-01` `wiki-validate`: carried-over graph rules
      evidence: bun test skills/lib/wiki — 56 pass; and against the corpus it was
      carried over from, 152 pages and 0 errors, the same counts that project's own
      validator reports. The three mobile-monorepo wikis, which never ran it,
      report 8 errors, including a `dear-child` placeholder committed as a README
      child. Reviewed by gpt-5.5; its one reproducible finding, a
      `business_subtree` written with a trailing slash silently disabling the
      self-containment rule, is fixed and covered.
- [x] `P1-07` Repo-root files: root-relative globs, a leading / matches from the repo root
      evidence: bun test skills/lib/docs — README.md classifies as live
- [x] `P1-06` Dead-glob detection
      evidence: bun test skills/lib/docs — caught `plans/*.md` and the dead `live: [README.md]` in this repo's own profile
- [x] `P1-05` Profile fixtures for the multi-product and mature shapes
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
