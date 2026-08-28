---
name: task-tracking
description: Use at the start of a task, when writing or updating a ticket, when work finishes and has to be recorded as done, when deciding what counts as evidence, or when docs-validate reports a tracker section, id, checkbox, evidence, duplicate-id or coverage problem.
---

# Task tracking

The tracker answers **what we intend, and is it done**. It is the one live
layer in this system, rewritten constantly and checked against the work every
time anyone looks, which makes it the safest place to be wrong and the only
legal home for whether a piece of work is finished. The reasoning is in
[the spine](../doctrine.md#the-spine) and
[one authoritative home per fact](../doctrine.md#one-authoritative-home-per-fact).

Two rules carry the weight, and they are the two an agent skips.

**State lives in the tracker and nowhere else.** A README narrating what is in
progress, a status paragraph in a plan, a session log saying the work happened:
each is a second answer that nothing keeps in step, and which one a reader
believes depends on where they stop scrolling.

**Done is tracker state plus evidence.** Code existing is not done, and neither
is a green run nobody recorded. [Done](../doctrine.md#done) says why, and this
skill says what to write.

## Read before starting

1. Resolve the profile that governs the path, by the rule in
   [finding the profile](../doctrine.md#finding-the-profile-that-applies), and
   say which one out loud. Take `tracker.backend` from it, then either
   `tracker.project`, the board this product's tasks live in, or
   `tracker.file`, the markdown file that is the tracker. Take
   `taskflow.enabled` and the `docs.checklists` globs too: the first decides
   where progress goes, the second decides what evidence looks like.
2. Resolve the mode of the path and say it out loud. It decides how much of
   this is required. Greenfield may keep tasks in a repo file and expects a
   numbered plan before the code; mature makes the ticket the unit of change
   and puts it in an external tracker. The table is in
   [mode](../doctrine.md#mode).
3. Read the task, then look for the work already recorded. An id that exists is
   the one to update. A second task for the same work is the same fault as a
   second file carrying state.

`tracker.backend` and `tracker.file` configure the repository, so they are
declared in the root profile and a product profile is refused for declaring
either. Two products disagreeing about where task state lives would each be
right about their own docs and wrong about the repository they share. A product
profile inherits both, so resolving the profile that governs the path still
answers where the tracker is. What the product declares for itself is
`tracker.project`.

## On start

Restate the task before touching anything: the scope as you understand it, and
the approach you intend. It goes in the ticket, or in the task entry when the
tracker is a file.

This is the only step here that has to happen before the code. A wrong reading
of the scope costs a sentence to correct now and a rewrite to correct later,
and the restatement is what makes the wrong reading visible while it is still
cheap. Say what you are leaving out, too. Most of the ambiguity in a task sits
at its edges rather than in the middle, and that is the half nobody writes
down.

## While the work is open

Nothing goes to the tracker. It holds intent and state, and a running
commentary in it is prose that has to be reread and reconciled by whoever picks
the work up.

Where the profile declares `taskflow.enabled: true`, that commentary has a
home. Read the task context at the start, then log as things happen:

```
taskflow-cli log info "rate table has no index on tenant_id"
taskflow-cli log commit "add the index" --hash 034543d
taskflow-cli log file docs/tasks.md
taskflow-cli log error "migration fails on the seed data"
```

**Taskflow is a separate axis from the tracker.** ClickUp and Linear hold issue
state; Taskflow holds the local session, its worktree and its log. Both can be
present at once, and the local contract is the same whichever external tracker
is configured. A log line is never the reason a task is marked done: the log
says what happened, and the tracker says what is true.

Two things do belong in the tracker while the work is open. A task that is
blocked moves to Blocked, because a task sitting in In progress against nothing
is the state that misleads. And work you find that is not this task becomes its
own task, in Todo, now.

## On finish

Four things, in the task entry or ticket:

- **What changed**, in a sentence someone new to the project can read. Not the
  file list, which the diff already holds.
- **The evidence**, which is the next section.
- **The wiki pages folded into**, if the work changed how something works.
  [wiki-authoring](../wiki-authoring/SKILL.md) is the skill for writing them,
  and a shipped document names them in its own `folded_into`, which is
  [project-docs](../project-docs/SKILL.md)'s subject.
- **Follow-ups, filed as their own tasks.** A follow-up buried in a finish note
  is invisible to whatever plans the next week, which is the same as not having
  written it.

Then move the task to Done, and not before.

## Evidence

The obligation is constant and its form follows the profile.

Where the product declares `docs.checklists` globs, evidence means the named
rows are ticked in the checklist. Where it declares none, as a repository on
continuous delivery reasonably does, evidence is the command and what it
reported, written into the finish note.

Name the result, not the verdict. `bun test` and `519 pass, 0 fail` is
something a reader can rerun and compare against; "tests pass" is a claim about
a run nobody can see. The same holds for a validator: name the exit code or the
count it printed.

No tool checks this part. `docs-validate` can see that an `evidence:` line is
there and cannot read what it says, so `evidence: done` passes the validator
and fails the rule. The line is where the obligation is discharged, not where
it is enforced.

## When the tracker is a file

`tracker.backend: in-repo` names a markdown file that **is** the tracker. With
ClickUp or Linear the rule that state lives in one place holds by construction,
because a markdown file cannot pretend to be the board. In-repo it has to be
enforced, and `docs-validate` enforces it over the file's shape.

```markdown
# Tasks

Notes about the tracker go here, above the first section.

## Todo

- [ ] `P3-05` Templates

## In progress

- [ ] `P3-04` `task-tracking` SKILL.md

## Blocked

## Done

- [x] `P3-03` `project-docs` SKILL.md
      evidence: bun test, 519 pass; `bunx project-validate` exits 0 here.
```

- **The sections are Todo, In progress, Blocked and Done**, as level-two
  headings, matched without regard to case, each appearing at most once. A
  section with nothing under it is fine and so is one that is absent; a fifth
  heading is not, because it is a fifth state nothing else in the system can
  read, and neither is a second heading of the same name, which splits the
  state it holds. A deeper heading is not a section and does not change state,
  so a `### Milestone 2` groups tasks inside whichever section it falls under,
  and everything below it keeps that section's state.
- **A task is a top-level checkbox row under one of those sections.** The
  section is what holds its state. A row above the first heading has none, and
  a checkbox is not a substitute.
- **The row opens with an id in backticks.** An id is what a commit message, a
  session log or a review can name the task by, and a description cannot be
  referred to. It names one task: the same id under two sections means the
  tracker holds two answers to whether that work is finished.
- **The checkbox follows the section.** Ticked under Done, unticked everywhere
  else. When the two disagree the file says two things at once, and the section
  is the one that wins.
- **A Done row carries an `evidence:` line**, naming the command and what it
  reported. It is indented, and it sits in the run of indented lines under the
  row, which ends at the first blank or unindented line. So the rest of the
  finish note can share that block, and a blank line between the row and the
  evidence detaches it. This is the rule the class exists for: a row ticked
  with nothing under it is exactly the claim nobody can check.
- **Indented rows are steps of the task above them.** They carry no id and no
  state of their own, which is what keeps breaking one task into steps from
  being a fault. Indented under no task at all is an error, because it is a
  list of state that nothing checks.
- **Fenced blocks and HTML comments are not state.** That is how a tracker can
  show its own format, and how a task can be commented out rather than deleted.
  It holds for evidence too: an `evidence:` line inside either is a line
  somebody took out of the file, and it leaves the row it sat under with none.

The file needs a `docs.tracker` glob that matches it, or none of the rules
above run over it and `docs-validate` says so. Where that glob lives, and the
two ways of getting the class wrong, are in
[project-docs](../project-docs/SKILL.md). The short version: the glob resolves
against the docs root, a leading `/` matches from the repository root instead,
and the one file that carries the class is the one `tracker.file` names. A
gitignored tracker is unreachable the same way, since the rules run over the
files git can see.

## Finish

```
bunx docs-validate
```

Exit 0, or the entry is not written. If this package is the repository you are
in rather than a dependency of it, the bin is not on the path and the same run
is `bun run skills/bin/docs-validate.ts`. An external tracker leaves nothing
here to check, which is the honest answer rather than a gap: no validator can
reach ClickUp or Linear, and one that read commit messages for ticket
references would fail every legitimate commit that predates its ticket.

Stop if you catch yourself thinking:

- "I will write the entry after the commit." The entry is what decided the
  commit was finished. Written afterwards it is a description of a diff, which
  is the one thing the diff already provides.
- "The evidence is obvious from the diff." Then name the command that made it
  obvious. A diff shows what changed and nothing about whether it works.
- "This is a small extra fix, it can ride along." Then the task's scope is now
  different from the one you restated at the start, and nothing recorded the
  change. File it, or restate the scope.
- "It is done, the code is written." That is the sentence this whole layer
  exists to refuse.
- "I will note the blocker in the session log." The log is not read by whoever
  is deciding what to work on next. Move the task to Blocked and say what it is
  waiting for.
