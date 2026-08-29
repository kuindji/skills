# Tasks

Copy this file to the path `tracker.file` names in the profile, then own it. It
is only needed where `tracker.backend` is `in-repo`; under ClickUp, Linear or
todo-tray the board is the tracker and this file should not exist, because a
second place carrying task state is a second answer nothing keeps in step. Where
the profile declares no tracker at all, this file should not exist either: the
repository has decided that nothing here answers what is intended or whether it
is done.

This file is the tracker. It is the sole authority on what is intended and
whether a piece of work is done, and no other file in this repository carries
that. A README narrating what is in progress, a status paragraph in a plan, a
session log saying the work happened: each is a second answer, and which one a
reader believes depends on where they stop scrolling.

A task is one checkbox row carrying an id, and it lives in exactly one of the
four sections below. It reaches Done only with an `evidence:` line under it,
naming what was run and what it reported.

```markdown
- [ ] `T-01` What the task is, in a sentence
- [ ] `T-02` A task with steps
      - [ ] The steps need no ids of their own
- [x] `T-03` Something finished
      evidence: bun test, 128 pass, 3 of them new; `bunx project-validate`
      exits 0 here.
```

Ids are free, as long as they are unique and every row has one: `T-01` here,
a stage and a number where the work follows a build order, a ticket key where
it mirrors one. The sections are fixed, and a fifth heading is a fifth state
nothing else in this system can read.

Delete this preamble once the tracker has real tasks in it, or keep the parts
that are still worth telling a newcomer.

## Todo

## In progress

## Blocked

## Done
