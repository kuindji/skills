# House rules

Copy this file into the repository, point `house_rules` in the profile at it,
and then own it. Delete what does not apply and add what is missing: a project
without TypeScript deletes the TypeScript rules, and a project that publishes a
package adds its release rule here rather than in a skill.

These are code rules, and code rules are deliberately not a skill. They vary
per project, and a versioned dependency is the wrong container for something
that has to be edited locally. What the skills own is the shape of documents
and the decay rate of sentences; what this file owns is how work is done in
this repository.

Every rule carries its rationale and its procedure. That is the half that does
not fit in a CLAUDE.md bullet, and it is the half that decides whether an agent
applies the rule to a case the rule did not anticipate. A rule with no reason
attached gets followed literally and worked around at the first inconvenience.

Give this file a `live` glob in the profile's `docs` block. It claims to
describe how things are done now, so it should be flagged for review when
nobody has touched it in `review_after_days`.

## Runtime and tooling

Use `bun`, never `npm` or `yarn`, for dependencies and for running TypeScript.

**Why:** the lockfiles are not interchangeable. A repository with `bun.lock`
that gets one `npm install` acquires a second, disagreeing dependency graph,
and the failure surfaces later on somebody else's machine as a version nobody
chose.

**How:** `bun install`, `bun add`, `bun run <script>`, `bunx <bin>`. If a tool
only documents an npm invocation, translate it rather than reaching for npm.

## Before calling it done

Run the type check, the linter, the formatter and the tests, and read the
output. Done means the commands ran and passed, not that the change looks
right.

**Why:** an agent claiming completion is making an assertion its reader cannot
cheaply check. The commands are how the reader checks it, so the claim is worth
exactly the output that came with it.

**How:** state the command and its result when reporting the work. "Tests pass"
without a command is not evidence. If a step was skipped, say which and why.

## TypeScript

No `as any`. Narrow `unknown` at the boundary and keep the inside typed.

**Why:** `any` does not silence a type error, it relocates it. The error still
happens, several frames later, in a place with no information about what went
wrong.

**How:** parse into `unknown`, validate at the edge, and return a typed result.
Code that cannot type its input is describing a gap in the schema, not a
limitation of the type system.

## Generated files

Never edit generated output. Change the generator or its input.

**Why:** an edit to generated output survives until the next generation and
then vanishes, usually without anyone noticing which commit lost it.

**How:** declare the patterns in the profile's `generated_paths` and let
`guard-generated` refuse the write. A pattern declared there is checked; a rule
stated only in prose is remembered until it is not.

## Comments

Comment what the code does and why it is shaped that way, not what the syntax
already says.

**Why:** the next reader is usually an agent with no memory of the decision.
The mechanism is legible from the code; the constraint that forced it is not,
and that is the part that gets broken by a well-meant refactor.

**How:** name the alternative that was rejected and the reason. A comment that
would still be true if the code were deleted is not about this code.

## Commits and branches

No co-authored-by trailers.

Do not create branches or worktrees without asking. Work happens on the main
branch unless the task says otherwise.

**Why:** attribution trailers make the history claim a review that did not take
place. Branches are a workflow decision, and an agent that opens one has made
that decision for a person who was not asked.

**How:** ask, and keep working where you are until there is an answer.
