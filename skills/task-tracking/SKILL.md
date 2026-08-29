---
name: task-tracking
description: Use at the start of a task, when asked to record work in a tracker, when writing or updating a ticket, when deciding what counts as evidence, or when docs-validate reports a tracker section, id, checkbox, evidence, duplicate-id or coverage problem.
---

# Task tracking

The tracker answers **what we intend, and is it done**. Where a repository has
one it is the one live layer in this system, rewritten constantly and checked
against the work every time anyone looks, which makes it the safest place to be
wrong and the only legal home for whether a piece of work is finished. The
reasoning is in [the spine](../doctrine.md#the-spine) and
[one authoritative home per fact](../doctrine.md#one-authoritative-home-per-fact).

Two questions, in order, and the first is the one an agent skips.

## First: is anything being recorded at all?

**A repository may declare no tracker, and most of the work an agent is handed
does not come with an instruction to record it.** Absence of a `tracker` block is
a configuration rather than a gap: nothing then answers what is intended or
whether it is done, and no rule in this file fires.

**Where a tracker is declared, the block says where task state lives and how to
reach it. It does not say that an agent should write to it.** That instruction
comes from one of two places, and from nowhere else:

- **You were told.** The task names a ticket, or asks for the work to be
  recorded, or the repository's own `AGENTS.md` or house rules say that work here
  is tracked. A repository that wants every task recorded says so there, which is
  where a convention no validator can check belongs, by
  [fixed versus project-local](../doctrine.md#fixed-versus-project-local).
- **A `tracker-ref` links the session to an item.** See
  [Taskflow](#taskflow-is-a-separate-axis) below.

Otherwise, write nothing to the tracker. Recording what someone is working on,
unasked, creates state they did not ask for and now have to maintain or delete.
Say what you did in the session instead.

The rest of this file is what to do **once one of those two things is true**.

## Second: the two rules that carry the weight

**State lives in the tracker and nowhere else.** A README narrating what is in
progress, a status paragraph in a plan, a session log saying the work happened:
each is a second answer that nothing keeps in step, and which one a reader
believes depends on where they stop scrolling. This holds even where nothing is
being recorded: the answer is then that the repository has no home for that fact,
not that some other file may take the job.

**Done is tracker state plus evidence.** Code existing is not done, and neither
is a green run nobody recorded. [Done](../doctrine.md#done) says why, and this
skill says what to write. Where there is no tracker there is no done in that
sense, only evidence named in the session.

## Read before starting

1. Resolve the profile that governs the path, by the rule in
   [finding the profile](../doctrine.md#finding-the-profile-that-applies), and
   say which one out loud. Take `tracker.backend` from it. **Absent means this
   repository tracks nothing**, and the only part of this skill that still
   applies is the restatement below. Otherwise take either `tracker.project`, the
   board this product's tasks live in, or `tracker.file`, the markdown file that
   is the tracker.
2. Take `taskflow.enabled` and the `docs.checklists` globs too. The first says
   whether a session log is available, the second decides what evidence looks
   like.
3. Resolve the mode of the path and say it out loud. It decides how much
   ceremony the work carries. Greenfield expects a numbered plan before the code;
   mature makes the ticket the unit of change. The table is in
   [mode](../doctrine.md#mode).
4. Where you are recording, read the task and look for the work already
   recorded. An id that exists is the one to update. A second task for the same
   work is the same fault as a second file carrying state.

`tracker.backend` and `tracker.file` configure the repository, so they are
declared in the root profile and a product profile is refused for declaring
either. Two products disagreeing about where task state lives would each be
right about their own docs and wrong about the repository they share. A product
profile inherits both, so resolving the profile that governs the path still
answers where the tracker is. What the product declares for itself is
`tracker.project`, and it may only do so where the root declares a tracker at
all.

## On start

**Restate the task before touching anything: the scope as you understand it, and
the approach you intend.** Say what you are leaving out, too.

This is the one step here that happens whether or not anything is being
recorded, because it is something you say rather than something you write. A
wrong reading of the scope costs a sentence to correct now and a rewrite to
correct later, and the restatement is what makes the wrong reading visible while
it is still cheap. Most of the ambiguity in a task sits at its edges rather than
in the middle, and that is the half nobody writes down.

Where you are recording, the restatement also goes in the ticket, or in the task
entry when the tracker is a file.

## While the work is open

Nothing goes to the tracker. It holds intent and state, and a running commentary
in it is prose that has to be reread and reconciled by whoever picks the work up.

Two things do belong there while the work is open, where you are recording. A
task that is blocked moves to Blocked, because a task sitting in In progress
against nothing is the state that misleads. And work you find that is not this
task becomes its own task, in Todo.

Where nothing is being recorded, both of those are things to say rather than
write, and the second is worth saying plainly: work found and not done is
invisible the moment the session ends.

## On finish

Where you are recording, four things, in the task entry or ticket:

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

Where nothing is being recorded, the same four things are worth saying, and only
the evidence is load-bearing: name the command and what it reported. Do not write
a finish note into a file that was not asked for it. A note with no home is a
second authority for a fact this repository decided not to keep.

## Evidence

The obligation is constant wherever a claim of doneness is made at all, and its
form follows the profile.

Where the product declares `docs.checklists` globs, evidence means the named rows
are ticked in the checklist. Those rows stay durable whether or not a tracker
exists, and they carry a different fact from tracker state: a ticked row says a
thing was observed, not that a piece of work is finished. Where the product
declares no checklists, as a repository on continuous delivery reasonably does,
evidence is the command and what it reported.

Name the result, not the verdict. `bun test` and `519 pass, 0 fail` is something
a reader can rerun and compare against; "tests pass" is a claim about a run
nobody can see. The same holds for a validator: name the exit code or the count
it printed.

No tool checks this part. `docs-validate` can see that an `evidence:` line is
there and cannot read what it says, so `evidence: done` passes the validator
and fails the rule. The line is where the obligation is discharged, not where
it is enforced.

## When the tracker is a file

`tracker.backend: in-repo` names a markdown file that **is** the tracker. With an
external tracker the rule that state lives in one place holds by construction,
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

## When the tracker is todo-tray

`tracker.project` carries the project code. Find the work already recorded with
`todo-tray task list --project <code>`, and read one with
`todo-tray task show <id>`. Output is JSON unless `--pretty` is given.

Its statuses do not line up with the four sections above, so the projection is
fixed here rather than left to a guess:

| todo-tray     | Means                                        |
| ------------- | -------------------------------------------- |
| `new`         | Todo                                         |
| `in-progress` | In progress                                  |
| `blocked`     | Blocked, and say what it is waiting for      |
| `in-review`   | in progress, review pending. **Not** done    |
| `done`        | Done                                         |
| `cancelled`   | closed without being done, carrying a reason |

`cancelled` is the one that gets misused. It is not a quieter `done`: it says the
work is not happening, and what it needs is the reason, not evidence.

**Evidence goes in the log**, which is append-only:

```
todo-tray log add <id> --type info "evidence: bun test, 519 pass, 0 fail"
todo-tray log add <id> --type commit "034543d add the index"
todo-tray log add <id> --type file docs/tasks.md
```

Not in an attribute, and not in the handoff. Both `attr set` and `handoff set`
replace a single value, so neither can hold a record that has to survive the next
write. The handoff is for the current state of the work, which is exactly the
thing that should be overwritten; evidence is a claim about a run that happened,
and a claim that can be silently replaced is not evidence.

`todo-tray step` is the same shape as the indented rows above: an ordered
checklist under one task, carrying no id and no state of its own.

## Taskflow is a separate axis

ClickUp, Linear and todo-tray hold issue state. Taskflow holds the local session,
its worktree and its log. Both can be present at once, and neither is the other:
a log line is never the reason a task is marked done, because the log says what
happened and the tracker says what is true.

Where the profile declares `taskflow.enabled: true`, `taskflow-cli log` is
available and is where a running commentary belongs if one is wanted:

```
taskflow-cli log info "rate table has no index on tenant_id"
taskflow-cli log commit "add the index" --hash 034543d
taskflow-cli log file docs/tasks.md
taskflow-cli log error "migration fails on the seed data"
```

**Available, not required.** This package does not ask for a running log, and
`taskflow.enabled: true` says the CLI is here rather than that you should be
using it. Taskflow's own session instructions may ask for logging, and that is
Taskflow's instruction to give.

**A `tracker-ref` attribute links a session to an item elsewhere.** Read the
task's attributes at the start:

```
taskflow-cli attr list
```

An attribute named `tracker-ref`, valued `<backend>:<id>`, names the item this
session belongs to, for example `todo-tray:SKL-12`. Where it is present you have
been told: that backend's contract above applies, and the item it names is the
one to update. Attributes resolve in layers, project then parent task then task,
so a project carries the default and a task overrides it with a specific item.

Setting one has a trap worth knowing: `attr create` takes a **name**, and
`attr set` takes the attribute's **id**, not its name.

```
taskflow-cli attr create "tracker-ref" "todo-tray:SKL-12"
```

## Finish

Where the tracker is a file, and only then, there is something to check:

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

- "I should record this task somewhere." Not unless you were asked, or a
  `tracker-ref` says you were. The tracker is not a diary of what an agent did.
- "There is no tracker here, so I will write the status into the README." That is
  the second authority this whole layer exists to refuse. The repository decided
  not to keep that fact; say it in the session and let it end there.
- "I will write the entry after the commit." The entry is what decided the
  commit was finished. Written afterwards it is a description of a diff, which
  is the one thing the diff already provides.
- "The evidence is obvious from the diff." Then name the command that made it
  obvious. A diff shows what changed and nothing about whether it works.
- "This is a small extra fix, it can ride along." Then the task's scope is now
  different from the one you restated at the start, and nothing recorded the
  change. Say so, or restate the scope.
- "It is done, the code is written." That is the sentence this whole layer
  exists to refuse.
- "I will note the blocker in the session log." The log is not read by whoever
  is deciding what to work on next. Where you are recording, move the task to
  Blocked and say what it is waiting for. Where you are not, say it in the
  session, plainly, rather than burying it.
