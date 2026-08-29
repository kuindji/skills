---
title: Optional tracking, and todo-tray as a backend
type: spec
status: shipped
last_updated: 2026-08-29
reviewed_by: gpt-5.5 rounds 1 and 2
folded_into:
  - profile
  - profile/doc-classes
  - skills
  - adoption
frozen_body_sha256: a1ad96fde8dc0cbccb51f4f36193942aceca3368fb3264efc18fc9ae75fc3fe6
---

# Optional tracking, and todo-tray as a backend

The [2026-08-27 design](2026-08-27-project-management-skills-design.md) is
shipped and frozen, and it decided that every repository names a tracker. This
document changes that decision. It does not edit the earlier one, which is frozen
at its date and reads correctly as a record of what was decided then.

## What was wrong

Three faults, one of which is the reason for the other two.

**The tracker was the single exception to this package's own rule.** The root
profile template says that every key in it is optional and that "a key left out
is not a gap: absence is a configuration", then carves out `tracker` as the one
block a repository must carry. The parser enforces the carve-out: a root profile
omitting `tracker` gets `No tracker backend is set` as an error, which means the
profile does not parse and every validator downstream stops with exit 2 rather
than reporting anything. An omitted block and an explicit `tracker: {}` were
indistinguishable.

That mattered because the working style this package is meant to serve is the
opposite of what it enforced. Tasks are picked by hand and handed to an agent.
Logging, handoff and progress notes are wanted when asked for, not automatically.
An agent recording what someone is working on, unprompted, is the behaviour to
prevent rather than the behaviour to require.

**`taskflow` was a tracker backend and is not a tracker.** Taskflow is a consumer
of this package and a local session tool: it holds the session, its worktree and
its log. It holds no issue state. The value was declared nowhere, in no fixture,
no template default and no consuming repository, so it was a wrong answer nobody
had yet given.

**todo-tray could not be named at all.** An unknown backend does not fail its own
rule and continue. It fails the parse, so a repository that named todo-tray got
no validation of anything else either.

## What this decides

**A repository may declare no tracker.** Absence is a configuration, the same way
the absence of a roadmap already is. Where no tracker is declared, no tracking
rule fires and there is nothing for an agent to write to.

**Where a tracker is declared, the block says where and how, not that an agent
must use it.** It is the contract an agent follows when it is told to record
something, or when a `tracker-ref` attribute links the session to an item. No
agent writes to a tracker unasked.

**The general form of the rule**, which reaches past the tracker: if an axis is
not defined, there is nothing to do on it unless told.

**`todo-tray` replaces `taskflow` in the backend list.**

## What was rejected, and why it matters

A `tracker.policy: required | encouraged | optional` key was designed and
discarded. It would have let a profile say how strict a repository intends to be,
which is real information, and losing it is a real cost: a reader of the profile
alone can no longer tell.

It was discarded on this package's own test for what belongs in the schema, from
[the doctrine](../../skills/doctrine.md): if editing it would break a validator it
is fixed in the skill, and otherwise it is a template the project owns. No
validator can observe whether an agent volunteered a tracker write, so the key
fails that test. The doctrine's stronger claim, that `path_citations` is the only
configurable policy in the system and that a proposal for a second one is evidence
the rule under discussion is wrong, turned out to be right here: the rule under
discussion was "an agent must write to the tracker", and that rule was wrong
rather than in need of a dial.

How strict a repository is therefore stays in its own `AGENTS.md` and house
rules, which every consumer already owns and edits. This repository keeps its
strict behaviour that way, and its `AGENTS.md` and tracker preamble already say
so.

## Schema

```yaml
tracker: # the whole block may be absent
  backend: in-repo | clickup | linear | todo-tray
  file: docs/tasks.md # in-repo only
  project: SKL # clickup, linear, todo-tray
```

Three shapes, three answers, because collapsing them is what hid the problem:

| Written                                                  | Means                                               |
| -------------------------------------------------------- | --------------------------------------------------- |
| no `tracker` key                                         | no tracker, and no tracking rule fires              |
| `tracker:` with no mapping under it, or a scalar or list | error `tracker.shape`, a malformed declaration      |
| a mapping naming no backend                              | error `tracker.backend`, a half-written declaration |

A product profile naming `tracker.project` under a root that declares no tracker
is an error: it names a destination in a system the repository does not use.

## Done, where there is no tracker

The doctrine defines done as tracker state plus evidence. With no tracker, the
repository has no durable authority for whether work is finished. The honest
consequence, and the one this document adopts, is that the claim is made in the
session with its evidence and does not persist. Where a product declares
`docs.checklists` globs those rows remain durable, but they carry evidence rather
than state: a ticked checklist says a thing was observed, not that a piece of
work is done.

Inventing a finish note with no home would be the wrong repair. A second
authority that nothing reads is the fault this system exists to prevent.

## todo-tray

`tracker.project` carries the project code. Work is found with
`todo-tray task list --project <code>` and read with `todo-tray task show <id>`.

Its statuses do not match the four the in-repo tracker uses, so the projection is
fixed here rather than left to an agent:

| todo-tray     | means                                                             |
| ------------- | ----------------------------------------------------------------- |
| `new`         | Todo                                                              |
| `in-progress` | In progress                                                       |
| `blocked`     | Blocked, and say what it waits for                                |
| `in-review`   | in progress, review pending. Not done                             |
| `done`        | Done                                                              |
| `cancelled`   | closed without being done, carrying a reason rather than evidence |

Evidence goes in the append-only log, `todo-tray log add <id> --type info`, with
`--type commit` for hashes. It does not go in an attribute or the handoff: both
`attr set` and `handoff set` replace a single value, so neither can hold a record
that has to survive the next write. That is the same objection that rules out a
wiki page as a home for task state, applied one level down.

## Linking a session to an item elsewhere

A convention rather than schema, because it binds two tools that know nothing
about each other. A Taskflow attribute named `tracker-ref`, valued
`<backend>:<id>`, names the item a session belongs to. Taskflow attributes
resolve in layers, project then parent task then task, so a project carries the
default and a task overrides it with the specific item.

An agent reads `taskflow-cli attr list` at the start. A `tracker-ref` present
means it has been told, and that backend's contract applies.
