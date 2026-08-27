# House rules

Rules for working in this repo. Copied from the template this repo ships, then
edited, which is exactly what a consuming project is expected to do.

## Runtime and tooling

Use `bun`, never `npm` or `yarn`, for dependencies and for running TypeScript.

Formatting is dprint, matching the config used across the other @kuindji repos.

## TypeScript

No `as any`. Narrow `unknown` at the boundary and keep the inside typed.

**Why:** every validator in this repo reads untrusted YAML and Markdown from
other people's repos. `any` at that boundary turns a schema error into a crash
three frames later, in the tool whose whole purpose is reporting schema errors.

**How:** parse into `unknown`, validate, and return a typed result. A validator
that cannot type its input is reporting a schema gap, not a TypeScript problem.

## Code placement

Executable code lives in `src/`. A skill directory holds `SKILL.md` and nothing
else.

**Why:** skills are read by several agents, only some of which understand skill
packaging. A bin is reachable by all of them and by CI; a script buried in a
skill folder is reachable only by a skill-aware harness.

**How:** if a skill needs to run something, declare a bin in `package.json`,
implement it under `src/bin/`, and have the skill call it by name.

## Validators

A validator reports the file, the line, the rule, and what to do about it. A
failure a reader cannot act on is a bug in the validator.

**Why:** these run against repos whose authors did not write the rule. "Invalid
frontmatter" sends someone hunting; "docs/wiki/orders.md:3 — `parents` must be
non-empty for every page except README" does not.

## Commits

No co-authored-by trailers.

Do not create branches or worktrees without asking.
