# Tasks

The tracker for this repo. `tracker.backend: in-repo` in `project-profile.yaml`
points here, which makes this file the sole authority for task state. No other
file carries it. A task moves to Done only with an `evidence:` line naming the
command that proves it.

Ids are `<stage><n>`, stages following the build order in the design spec,
then `A` for the adoption order that spec ends with and `H` for the
housekeeping sweeps and what they turn up.

## Todo

- [ ] `A-01` Adopt in the business-wiki repo
      The smallest real subject: one product, a business-only wiki, no roadmap.
      The first repository brought into compliance, and the first reading of
      the templates by a repository that did not write them. `P5-02` is met, so
      the gate the design spec put in front of every row below is open.

- [ ] `A-03` Adopt in the mobile monorepo
      Clone ownership, four products, per-product roadmaps and checklists. Its
      profile already ships here as a fixture, so what is new is owner
      resolution against four real clones sharing one origin. Waits on `A-02`.

- [ ] `A-04` Adopt in the fourth project
      Follows once the schema has survived the other three.

## In progress

- [ ] `A-02` Adopt in the commerce repo
      Taken before `A-01` because the repository was the one made available. The
      wiki validator's real trial: 152 pages, two wiki profiles, an external
      tracker, mature mode, and the line-number worklist the spec measured at 19
      pages and 193 occurrences, which came in at 21 pages and 200.
      evidence: `bunx project-validate` in the consuming repository, run from
      the installed package rather than from here: 0 errors, 74 warnings, exit
      0. `bun cli/wiki/validate-wiki.ts`, the repository's own validator, still
      exits 0 over the same 152 pages, and its two test files that import
      `validateWiki` pass.
      Held here rather than Done because the change is uncommitted in that
      repository and has not been read by its owner. What is settled is that the
      schema fit: a profile written from the template classified all 148
      documents with no `docs.unclassified` and no ambiguity, and the wiki's
      graph rules, frontmatter, edge symmetry, reachability and business-subtree
      containment, passed on the first run with zero errors. The design was
      taken from this repository and it still had to survive being read back at
      it by a tool.
      What it cost the repository: 200 line-number citations stripped from 21
      pages, 45 lifecycle documents given a `type` and `status` block they had
      never carried, one plan renamed to its date, `docs/wiki/PRINCIPLES.md`
      reduced to the half a validator cannot check, and the code rules moved out
      of `CLAUDE.md` into a `docs/house-rules.md` the profile points at.
      What it cost this package: `wiki.lineNumber` matched only the first number
      of a comma list, so `foo.ts:36,41` was named in the diagnostic as
      `foo.ts:36`, and its remedy applied to what was named left `foo.ts,41`
      behind. The leftover carries no colon, so nothing catches it afterwards:
      following the tool's own instruction produced text the tool then called
      clean, on 59 citations in that repository. Fixed here, red test first.
      evidence: `bun test skills/lib/wiki/prose.test.ts` — the new
      "a list of lines is named whole" fails on the old regex with
      `Received: "\`src/wiki.ts:101\` cites a line number."`and passes on the
      new one;`bun test`— 602 pass, 0 fail.
      open: whether the repository's own`cli/wiki/validate-wiki.ts`stays. Two
      validators over one wiki is two authorities, and this one is imported by
      two test files under`serverless/api/ai-assistant/tests/`, so removing it
      is a code change rather than a deletion. Its owner's call.

## Blocked

## Done

- [x] `H-04` The front door narrated status it does not own
      evidence: `bun run validate` — no problems, exit 0; `bun run
      skills/bin/docs-validate.ts` — 5 documents, the front door among them,
      classified `live` and inside its review age.
      The README opened with a status paragraph saying the wiki was still to
      come and was the acceptance gate, and the layout table said the wiki root
      was empty until milestone 1. Both were true when written and false the
      moment `P5-01` landed. Neither was reachable by any validator: a `live`
      document is aged by its last commit, and this one was committed the same
      day it went wrong.
      The paragraph is gone rather than corrected. Whether a piece of work is
      finished is the tracker's answer, and a README that repeats it is a
      second authority that nothing keeps in step, which the doctrine says
      plainly and which this repository was doing on its own front page. What
      replaces it points at the spec and at the tracker and says why it will
      not narrate either.
      Found while closing `P5-02` rather than by the sweep that should have
      caught it. `H-01` ran the docs step as written and the step asks about
      stale `active` documents and unfolded `shipped` ones, not about whether a
      `live` document is still true. That gap is real and is the reason
      `review_after_days` exists, but 90 days is the wrong clock for a status
      line that goes false in a day.
      folded into: nothing. The front door is not a wiki page and the wiki
      already says what the package is.
      follow-up: none. The temptation is a validator that reads a README for
      status prose, and it would be a grep for "status" with no decay argument
      behind it.

- [x] `P5-02` Acceptance: `project-validate` exits 0 on this repo
      evidence: `bun run validate` — no problems over 12 pages and 5 documents,
      exit 0; `bun test` — 600 pass, 0 fail; `bun run type-check` clean. The
      wider half of the gate, that all four skills have been exercised here,
      has a task behind each one: `wiki-authoring` in `P5-01` and `H-03`,
      `project-docs` in `P5-03`, `task-tracking` in every entry in this file,
      and `housekeeping` in `H-01`.
      The gate is met, so the adoption order opens and `A-01` is next. Nothing
      outside this repository has been read or touched to get here, which was
      the constraint the design spec put on the whole build: the hard shapes
      arrived as fixtures instead.
      What the gate was worth is measurable now that it is met. Running the
      rules against the repository that wrote them turned up three faults no
      unit test had: two stale tests in `P5-01` that asserted properties of a
      directory rather than of a rule, and a reporting fault in `H-02` that
      overstated coverage in the one window where a reader believes it. None of
      them would have surfaced against a fixture.
      folded into: nothing new. `P5-03` folded the design spec that describes
      this gate, and the wiki page on testing already holds why the repository
      is its own first subject.
      follow-up: none beyond `A-01` to `A-04`, already filed.

- [x] `H-03` The `adoption` page carries no names
      evidence: `bun run skills/bin/wiki-drift.ts --json` — the page goes from
      0 names to 3 names reaching 20 files, and the run now traces 11 of 12
      pages; `bun run skills/bin/wiki-validate.ts` — no problems, 0 path
      references across 12 pages, and the page is 658 words against a 700-word
      warning.
      It names the package, the constant that carries where the root profile
      template is copied from, and the two bins a consuming repository types
      first. All three are names rather than positions, which is the only
      reason they can be traced at all: the page is about a consumption
      contract, and the temptation was to cite the files that hold it.
      `README` stays at 0 names on purpose. An index names its children and
      nothing else, so it is the honest case for a page surfaced on age alone,
      and `H-02` is what makes that visible instead of counting it as traced.
      folded into: `adoption`, which is the page itself.

- [x] `H-02` `wiki-drift` counts a page it never traced as traced
      evidence: the test named "a page nothing could be traced on is not
      counted as traced" in the `wiki-drift` CLI suite, written first and
      verified red against the old renderer, which printed `0 pages queued, 2
      pages traced and unchanged` for two pages nothing had been traced on;
      `bun test` — 600 pass, 0 fail; `bun run skills/bin/wiki-drift.ts` over
      this repository now reports `11 pages traced and unchanged, 1 page
      untraced` where it reported 12 traced before.
      The run always knew the difference and only the prose form hid it, so the
      fix is a split count and one line saying what an untraced page is. The
      reason enum is unchanged: past the age threshold the same page is already
      queued as untraceable, and a fourth reason would have been a second name
      for a state that exists.
      folded into: `drift`. The page said the run does one of two things for
      every page, which was true of an old page and not of a new one, so the
      third case is now written down: neither traced nor surfaced, and counted
      apart from the traced pages.

- [x] `H-01` The first housekeeping sweep
      evidence: `bun run skills/bin/project-validate.ts` — no problems over 12
      pages and 5 documents, exit 0; `bun run skills/bin/wiki-drift.ts` — 12
      pages read, 114 files searched, 0 queued; `bun run
      skills/bin/docs-validate.ts` — no problems, exit 0. Coverage step run by
      hand: 86 exported names against the wiki, 7 bins, 4 skills, 6 templates.
      Nothing was fixed, because nothing mechanical was broken. The two
      findings are both proposals, filed as `H-02` and `H-03`.
      The worklist is empty and that is not a claim about the wiki. Every page
      carries a date inside the last two days, so churn has nothing to measure
      against and the first sweep of any wiki is structurally quiet. What the
      run did surface is the shape of the corpus: two pages extract no names at
      all, `README` and `adoption`, and `testing` extracts one. `README` is an
      index and correctly names nothing, which is the honest case for a page
      that is surfaced on age alone. `adoption` is `H-03`.
      The finding worth the sweep is `H-02`, and it came out of reading the
      summary against the JSON rather than out of any page. The tool prints
      the two zero-name pages inside "12 pages traced and unchanged", which is
      the exact confusion its own doctrine warns about: a reader who takes a
      heuristic for a proof. It is a reporting fault, not a rule fault, so it
      is code and it is filed rather than fixed here.
      Coverage gaps, as candidates and not filled. The frontmatter parser has
      no page: every layer in this system reads frontmatter and both skills
      document what the parser refuses, a flow collection split over lines, a
      tab, a duplicate key, but no page names it. The bin shell has none
      either: the wiki gives the contract every bin shares and not the
      mechanism, so nothing describes how a diagnostic is rendered or why the
      injected console is what makes a bin testable end to end. Smaller: the
      package's own name appears on no page in its own wiki.
      Steps that did nothing, said plainly. Step 3 reread nothing because the
      worklist was empty. Step 6 touched no page, because the unslop pass runs
      over what the sweep opened and the sweep opened none. Step 5 found no
      stale active document, which is true today only because `P5-03` shipped
      the one lifecycle document this repository has.
      folded into: nothing. A sweep that folds is a sweep that rewrote.
      follow-up: `H-02` and `H-03` filed.

- [x] `P5-03` Ship the design spec: `folded_into`, then `docs-freeze`
      evidence: `bun run skills/bin/docs-freeze.ts
      docs/specs/2026-08-27-project-management-skills-design.md` — frozen at
      58218e04e892; `bun test` — 599 pass, 0 fail; `bun run type-check` clean;
      `bun run validate` — no problems over 12 pages and 5 documents, 1 of them
      lifecycle. Both gates were verified red before being believed: a typo in
      one `folded_into` slug fails `docs.foldGate` with exit 1, and a one-word
      edit to the frozen body fails `docs.frozen` with exit 1, each restored
      immediately after.
      The spec is `shipped`, names the twelve wiki slugs its content now lives
      in, and its body is frozen. It is the first real document either gate has
      run against here; until today both had only ever seen fixtures.
      The fold produced one new page, `adoption`, because the read found
      exactly one subject the wiki did not hold. Everything about how a project
      takes this package on lived only in the spec: a git dependency pinned to
      a tag with no registry, bins that a consumer's package runner puts on the
      path and that this repository has to invoke by file, six templates that
      are copied and then owned and never updated from here again, and the
      agent instructions file as the entry point because it is the one file
      every agent reads unprompted. That is the half a freeze would have
      entombed, which is the fold gate working as designed rather than as a
      formality.
      `folded_into` lists every page in the wiki, which is honest rather than
      generous: the document designed the whole package, so its durable content
      is the whole wiki. The one part it cannot record is the doctrine, which
      took the spec's why-half during `P3-01` and is not a wiki page, so it has
      no slug to name.
      What deliberately stayed in the spec is the half a wiki must not hold:
      the options that were rejected, the measurements each rule was decided on,
      the argument against phasing the build, and the two places the build later
      went the other way, `watch_paths` and the shape of the task-tracking
      validator. Frozen at its date, those read as a record of a decision. Moved
      into the wiki they would read as instructions, and corrected in place they
      would erase that the decision was ever made.
      folded into: `adoption` is new; the other eleven pages were written
      against this spec in `P5-01` and are unchanged by it.
      follow-up: `A-01` to `A-04` filed, the adoption order the spec closes
      with. That was the only live intent left in the document, and a frozen
      document is the one place intent cannot survive.

- [x] `P5-01` Write this repo's `docs/wiki/`
      evidence: `bun test` — 599 pass, 0 fail; `bun run type-check` clean;
      `bun run validate` reports `no problems` over 11 pages and 5 documents,
      where before this task it carried the standing `wiki.empty` warning;
      `bun run skills/bin/wiki-drift.ts` — 11 pages read, 114 files searched,
      0 queued, 11 traced and unchanged.
      Eleven pages and a principles file. A README, five top-level pages for
      the profile, the validators, the skills, drift and testing, and four
      children where one page would have answered two questions. The wiki is
      about this package as a piece of software, for a reader who will change
      it: what each module is for and why it is shaped that way. It does not
      restate the doctrine, which holds why the rules exist, and it does not
      restate the design spec, which is frozen at its date and holds what was
      decided and what was rejected.
      The drift line is the one to read. Every page traced, none surfaced on
      age, which means every page carries names that still resolve to files in
      this repository. That is the claim the `wiki-drift` half of the system
      rests on, and it had never been made against a real wiki before.
      `path_citations: forbidden` is the constraint that did the most work. No
      page may name a file by a path carrying a code extension, so the profile
      is "the profile", the tracker is "the file the profile names", and every
      module is named by its exported functions instead. 0 path references
      across 11 pages. Writing under the rule is what showed it is livable:
      the ban costs a sentence per page and buys the tracing above, because a
      page that cites positions has nothing greppable on it.
      Two faults, both tests, and both found by going red the moment the wiki
      existed. `wiki.empty` was measured against this repository's own wiki
      root, so the test asserting that an empty root warns was asserting a
      property of a directory rather than of the rule, and it stopped testing
      anything the day the directory was filled. It now points at a fixture
      that is empty on purpose and says so in the file that keeps it, and a
      second test covers the absent-root case that shares the diagnostic. The
      profile dogfood test had the same shape from the other side: it proved
      the declared wiki root exists by asking for the `.gitkeep` that was
      holding the empty directory in git, so deleting the placeholder the wiki
      had made pointless broke it. It now loads the root and asserts it holds
      pages, which is what the test was always for. All three were verified red
      by removing the thing each one names.
      This repo now owns a `wiki-principles` file at the wiki root, which is
      the project-local half the skill reads before writing: the voice, the one
      style profile this wiki runs, the canonical vocabulary, and the sections
      each kind of page carries. It is the first exercise of the branch that
      keeps that file out of the graph.
      folded into: the wiki itself is the deliverable, so nothing was folded
      into an existing page. The design spec's own fold is `P5-03`.
      follow-up: `P5-03` filed. `P5-02` stays open on purpose: the umbrella
      exits 0 as of this task, and the gate the spec describes is wider than
      the exit code, since it also asks that all four skills have been
      exercised here and `housekeeping` has not been run as a sweep yet.

- [x] `P4-01` `housekeeping` SKILL.md and the sweep
      evidence: bun test — 598 pass, 51 of them new and every one written to
      fail first, each verified red by breaking the thing it checks; `bun run
      type-check` clean; `bun run skills/bin/project-validate.ts` exits 0 here,
      with the one standing warning that `docs/wiki` is empty, which is
      `P5-01`. The fourth skill, and the seventh bin under it.
      The sweep's step 2 ships as code, `wiki-drift`, because it is the step
      that turns an unbounded instruction into a list with an end, and a step
      that is different every time it runs does not do that. It is the first
      bin that reports rather than judges: it enforces no rule, a queued page
      is not a fault, and it exits 0 whenever it produced a list. That keeps it
      out of the umbrella, next to `docs-freeze` and `guard-generated`, and the
      reason is now in doctrine rather than in this entry.
      The `watch_paths` note is decided: there is no such key, and the
      frontmatter contract stays at five. It is a list of positions, and this
      system bans those in prose precisely because a stale one points nowhere,
      so blessing them in frontmatter would move the decay to the one place no
      reader passes. A page that needs to pin a file cites it in the body,
      where a reader sees it, and the extractor reads a cited path as a name of
      its own kind, which is the escape hatch the spec was reaching for arriving
      through the front door. A page with nothing greppable is surfaced on age.
      The measure of the extraction is what it throws out. Nine rejection rules
      and a ceiling of 200 files per name, because a token in three hundred
      files is a word, and one word at the top of the list is what makes an
      ordered worklist worthless. Every drop is reported, since a real name
      dropped is a page that looks traced and is not.
      Two faults found in the writing, both in the tests rather than the code.
      Nine of the first 35 tests passed for the wrong reason: the fence-masking
      test used a fence whose content was rejected anyway, the whitespace test
      was already covered by the identifier shape, the path-boundary test
      compared paths that no boundary separated, and the age-ordering test had
      one entry to order. Each was found by breaking the thing it named and
      watching it stay green, which is the only way that class of test is
      found at all.
      The AGENTS.md note is closed by a test rather than by the row it asked
      for. The template tests check that every path the table names resolves,
      which is the opposite direction and stays green while the table falls a
      row behind; the new one walks the skills directory and fails on a skill
      missing from either copy of the table.
      Four faults in the code, three of them found by reading it back and one
      by gpt-5.5, and every one is a way the run lies confidently rather than a
      way it breaks. A shallow clone gives every file the boundary commit's
      date, so the whole wiki reports churn, and CI checks out at depth one by
      default; a docs root at the repository root normalises to the empty
      string, which the exclusion read as no root at all and so searched every
      spec as though it were code; an undated page was told its names were
      missing from a repository they are still in, because three ways of being
      untraceable shared one sentence; and a page naming `analytics.rate_table`
      was permanently untraceable, because extraction accepts a dotted name and
      the index split on the dot. The first two now say so in the run, the
      third has its own sentence, and the index holds dotted names and their
      segments both.
      One gpt-5.5 round, three findings, each reproduced before it was acted
      on. It found the dotted-name miss and the empty docs root, which I had
      already found and fixed, and a third I had not: `--json` dropped the
      loader's own findings while the prose form printed them, so a machine
      reading the worklist could not tell a sweep that measured what it claims
      from one pointed at a subdirectory, where no date matches any file.
      folded into: nothing yet. `docs/wiki/` is empty until `P5-01`, and this
      task's reasoning that outlives it is in `skills/doctrine.md`.
      follow-up: none filed. The coverage-gap extractors stay manual and
      deferred, which is recorded in doctrine, not carried as a task.

- [x] `P3-05` Templates
      evidence: bun test — 546 pass, 15 of them new and every one written to
      fail first, each verified red by breaking the thing it checks; `bun run
      skills/bin/project-validate.ts` still exits 0 here. Six files a project
      copies out of `skills/templates/` and then owns: the root profile, a
      product profile, the tracker file, the house rules, the wiki principles,
      and the block that goes into `AGENTS.md`. The spec named four; the
      product profile is the fifth because the multi-product shape is one of
      the three this system serves and reading it out of a frozen spec is not
      adoption, and `tasks.md` is the sixth for the reason the review found.
      A template is the one thing here that is never run where it is written,
      so the measure is a repository that copies it. Four scratch repositories
      with this package installed as a dependency: the default shape, the same
      with a product profile added, one on Linear with no tracker file, and one
      with the `wiki` block deleted. All four exit 0, with warnings that are
      honest rather than absent, naming globs the repository has declared and
      not yet written. That run is now a test, which is what makes it a claim
      rather than a session: it copies every template into a scratch git
      repository the way each template's own header says, and asserts the
      umbrella reports `0 errors` over 4 documents.
      The task found three faults, and two of them were the templates walking
      into the system's own edges. Naming a template `project-profile.yaml`
      makes it a profile: discovery is by that basename, so the shipped file
      was read as configuration and this repo reported `skills/templates` as a
      nested repository skipped. The templates carry `.template` in their names
      and `profile.missing` now names the file that ships. The second was the
      spec's own example. A product profile written `docs.root: .` prefixed
      `./`, which no repo-relative path starts with, so it classified zero
      documents while reading as fully configured, and every document it owned
      was reported as unclassified against the profile above it, which sends a
      reader to add globs to the wrong file. Every spelling of the repository
      root now normalises to one, an empty root means every path is under it
      rather than none, a product profile claiming the repository root is
      refused with its own directory in the remedy, and the two messages that
      printed the root no longer print it as an empty pair of backticks.
      Two gpt-5.5 rounds, five findings, each reproduced before it was acted
      on. Round 1 found the one that mattered: a verbatim copy of the templates
      exited 1, because the profile declared an in-repo tracker at
      `docs/tasks.md` and no template created that file, so
      `docs.trackerUnchecked` fired on the first run of a repository that had
      done exactly what it was told. My own scratch check had missed it by
      writing that file by hand. It also found `AGENTS.md` sitting outside
      every declared glob: the block tells a reader to create it, and a file
      outside the docs root is never reported as unclassified, so it aged
      unwatched. Round 2 found three claims of mine that the code contradicts,
      all in comments that ship into other repositories: the board is named by
      `tracker.project` and not by `tracker.backend`; a running commentary does
      not accumulate in the tracker file in the absence of Taskflow, it belongs
      in the tracker nowhere; and `wiki-principles.md` under the wiki root
      answers to neither validator rather than to `wiki-validate`, which is the
      one file whose whole subject is that distinction.
      This repo now carries `AGENTS.md`, which is the block with its paths
      edited, and `/AGENTS.md` in its `live` globs.

- [x] `P3-04` `task-tracking` SKILL.md
      evidence: bun test — 531 pass, 12 of them new and every one written to
      fail first, each verified red by reverting its fix; `bun run
      skills/bin/project-validate.ts` still exits 0 here. The skill an agent
      follows at task start, while the work is open and at finish, written
      against the validators rather than the spec. The measure of that is the
      same one `P3-02` and `P3-03` used: every rule the tracker validators can
      emit was enumerated and held against the draft. Twelve of the thirteen
      map to a sentence; `docs.trackerClass` is deliberately thin because
      `project-docs` already owns the placement rules, and the profile schema's
      unknown-backend error is not this skill's subject. End to end in a scratch
      repository with this package installed as a dependency: a tracker written
      by following the skill and nothing else, carrying nested steps, a
      commented-out task, a deeper heading and an evidence line, and `bunx
      docs-validate` exiting 0. Every claim about the file's shape was checked
      against the tool rather than assumed, which caught two wordings of mine
      that were wrong: an example that put a `###` heading after Done, where the
      rule I had written was right and my example was not, and "indented
      directly beneath", which the parser does not require.
      Writing the skill found the fail-open behind most of this task. The
      tracker rules run only over files classified `tracker`, so a repository
      could declare `tracker.backend: in-repo`, name a `tracker.file`, write it,
      and have every one of them silently not run: a tracker outside the docs
      root reported nothing at all, and one inside it reported
      `docs.unclassified`, which reads as a filing question rather than as the
      tracker being unchecked. `docs.trackerUnchecked` now says so, including
      where no docs root is declared and where the file is gitignored, which is
      the same unreachability by another route. The second fault was mine to
      make worse: `tracker.file` is repo-wide, so a product profile read
      `undefined` and reported every file it classified as `tracker` as misfiled
      against a tracker of that name. A product now inherits the file the way it
      already inherited the backend, and declaring its own is refused.
      Two gpt-5.5 rounds, five findings, each reproduced before it was acted on.
      Round 1's worst was a fail-open on the one rule the class exists for:
      `findEvidence` scanned ahead over raw lines rather than the ones the
      parser reads, so an `evidence:` line inside an HTML comment satisfied a
      Done row while the same comment hid the row from every other rule. Reading
      it in the main loop fixes both that and the fenced case, and the fifteen
      shapes probed afterwards, tabs, CR endings, steps between the row and the
      line, an unclosed fence, behave as they did. Its other two were prose:
      "each appearing once" reads as requiring all four sections, which the
      validator does not, and a claim that a product profile carries nothing but
      `tracker.project`, which the parser did not enforce until this task.
      Round 2 found the one the refusal had created. The skill opens by telling
      an agent to resolve the profile governing the path and read the tracker
      out of it, and under a product profile that profile now had no file to
      read. Inheritance is what makes that sentence true, and it also deletes
      the option I had threaded through `classifyDocPaths` to work around it.
      Round 2's other finding is answered in the skill rather than in code:
      `evidence: done` passes the validator and fails the rule, because no tool
      can read whether an evidence line is true, and the skill now says so
      rather than implying the check is stricter than it is.
- [x] `P3-03` `project-docs` SKILL.md
      evidence: bun test — 519 pass, 15 of them new and every one written to
      fail first; `bun run skills/bin/project-validate.ts` still exits 0 here.
      The skill for writing, shipping and editing a document under a docs root,
      written against the validators rather than the spec. Whether that was
      worth doing is measurable the way `P3-02` measured it: every rule the docs
      validators and the freeze writer can emit was enumerated and held against
      the draft, which found five with no sentence covering them
      (`docs.shallowClone`, `freeze.badFrontmatter`, `freeze.emptyBody`,
      `freeze.anchoredKey`, `freeze.notLifecycle`) and one covered too weakly
      (`docs.trackerClass`). Two stay deliberately thin,
      `freeze.outsideRepository` and `freeze.anchoredKey`, because neither is
      reachable by an agent following the skill. The seven `docs.tracker*` rules
      about the shape of the tracker file are `P3-04`'s. End to end in a scratch
      repository with this package installed as a dependency: a spec written by
      following the skill and nothing else, folded into a wiki page, shipped,
      frozen, and `bunx docs-validate` exiting 0 — and each claim checked
      against the tool rather than assumed, including that a trailing-whitespace
      sweep survives the hash while a reworded sentence does not.
      Writing the skill is what found the bug behind most of this task. A
      frontmatter block that fails to parse carries no keys, so every rule
      reading them reported each key as absent while it sat visibly on the
      page: five misreports on a wiki page whose `title:` is on line 2, two on a
      lifecycle document. It is the same fault already fixed twice here, in
      `planFreeze` and in the SKILL.md contract, with the heuristic copied each
      time. It now lives once in the parser as `malformed`, and all four callers
      read it. The shared predicate also drops a false positive the copies
      shared: a block holding only comments is valid YAML that carries no keys,
      and was being called broken YAML.
      Two gpt-5.5 rounds, seven findings, each reproduced before it was acted
      on. Round 1 caught a sentence of mine that my own fix had made false, the
      two `docs-freeze` refusals an agent is likeliest to hit and that the skill
      left out, and a third instance of the misreport: `---` on the line after
      `---` was reported as the document having no frontmatter block, about a
      file whose first two lines are exactly that. Round 2 found the one that
      writes. `splitBlock` searched for the first `---` after the opener while
      the parser had matched the last, so a document whose first content line
      was itself `---` had the hash spliced into a phantom empty block and every
      key that authorised the freeze pushed below the closing delimiter into the
      body. It predates this task and both regexes produce it. Round 2's other
      finding was that the new remedy explained parse failures while the rule
      also fires on a list or a scalar, which is valid YAML in the wrong shape,
      so it now names the mapping first. The regex change was the risk worth
      checking rather than assuming: its optional group is greedy, so every file
      that matched before matches identically and only the previously
      unmatchable case moves, verified against `docs-freeze` round-tripping a
      body opening with a rule, a second block, CRLF, a byte-order mark and
      trailing spaces, and pinned by tests.
- [x] `P3-02` `wiki-authoring` SKILL.md
      evidence: bun test — 500 pass, 31 of them new and every one written to
      fail first; `bun run skills/bin/project-validate.ts` still exits 0 here.
      The first skill, and the contract that keeps a SKILL.md honest, which is
      a test rather than a bin because a consuming repository has no `skills/`
      directory to check. Written against the validators rather than the spec,
      and the measure of whether that was worth doing is that all nine failures
      in the `wiki/broken` fixture map to a sentence in it. End to end: a
      scratch repository with this package installed as a dependency, a page
      written by following the skill and nothing else, and `bunx wiki-validate`
      exiting 0, which is also how the finish command was verified rather than
      assumed. The 395 SKILL.md files installed on this machine are the corpus
      for the contract, and they found three faults of mine before review. The
      1024-character limit is on the description and not on the block, which
      read as the block fails 43 of them, including shipped skills carrying
      `metadata` and `hooks` around descriptions of 836, 908 and 1013
      characters. A block that fails to parse was reported as two absent keys
      that are visibly on the page, which is what a real, working skill whose
      description carries a colon looks like. And a Markdown reference
      definition whose label holds whitespace is not a definition: `[x:
      string]: any` is a TypeScript index signature, and it was 180 of 188
      dead-link reports. The corpus also prices the rule that a skill directory
      holds `SKILL.md` and nothing else: 338 of the 395 carry more, so the rule
      is this repo's own and deliberately narrower than the ecosystem's. Two
      gpt-5.5 rounds, eight findings, each reproduced before it was acted on.
      Round 1's worst was the one factual error in the skill, which told an
      agent to split an over-budget page under `<slug>/`; the validator refuses
      that for the wiki README, whose children have to be top-level. Its one
      wrong finding was to scan bare prose for bin names, which the corpus
      refutes: `re-validate` and `auto-generated` are 77 matches across those
      files and not one is a command. Round 2 found the two faults that were in
      the code rather than in the skill. `business_subtree` let the index carry
      any edge to the README rather than only the parent edge doctrine names,
      so a `related_pages: [README]` pair passed while being dead wherever the
      subtree ships. And a wiki page could declare `title` twice: YAML keeps
      the last of two, silently, so the page showed one title to a reader
      scanning from the top and another to everything walking it. Both report
      now, and duplicate detection is quote-aware, because `"title":` and
      `title:` are one key to the parser and were two to the check.
- [x] `P3-01` `doctrine.md`
      evidence: bun test — 469 pass, two of them new and written to fail first;
      `bun run skills/bin/project-validate.ts` still exits 0 here. The knowledge
      map the four skills will link to instead of restating, so the test of what
      belongs in it is whether two skills would otherwise have to say the same
      thing. That test is what pulled in profile resolution, the lifecycle
      status contract and the owner-scope severities, and what kept per-class
      enforcement detail out. Writing it against the finished validators rather
      than against the spec is what made it useful, because the code has moved:
      the spec's six doc classes are seven in `DOC_CLASSES`, `ignored` among
      them, and three things under a docs root are exempt from classification
      that the spec never mentions. The umbrella is the sharpest divergence.
      The spec says `project-validate` runs all six bins; it runs three, because
      `guard-generated` judges a change rather than a repository and
      `docs-freeze` writes. Doctrine records the implemented scope and names the
      divergence rather than narrowing the spec in silence. Two gpt-5.5 review
      rounds, nine findings between them, every one reproduced against the code
      before it was acted on. Round 1 caught a claim of mine that was flatly
      wrong: that a dated document cannot mislead, which is true of a shipped
      doc and false of an `active` one, the exact case `stale_after_days`
      exists for. Round 2 found the only one that was a code fault rather than a
      prose fault, and it is the reason this task touched `skills/lib`:
      `owners.overlap` compared claim strings with `seen.get(path)`, so
      `packages` and `packages/ui` declared by two owners partitioned nothing
      and reported clean, while product `paths` were already held to
      `patternsCollide` a few files away. Ownership is now checked by whether
      two patterns could ever name the same file, which is what the rule always
      said.
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
