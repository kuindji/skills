# Wiki principles

Copy this file to the wiki root, where it must be named `wiki-principles.md` or
`PRINCIPLES.md`, and then own it. Under either of those two names, at the root
and nowhere deeper, it is prose about the wiki rather than a page in it: it
carries no frontmatter and no edges, and `wiki-validate` will not report it as
an orphan. Any other name, or the same name one directory down, is a page and
is validated as one.

`wiki-authoring` reads this file before writing anything. What it takes from
here is everything the validator cannot check: voice, which style profiles this
wiki runs and what each one may assume, and the sections a page of each kind is
expected to have.

The dividing line is mechanical. **If editing it would break a validator, it is
fixed in the skill. Otherwise it is here.** Frontmatter shape, link resolution,
bidirectional edges, reachability, the size budget and the position bans are
fixed, so do not restate them: a rule written in two places drifts, and then
whichever copy gets read first wins. Everything below is this project's, and
every line of it is meant to be rewritten.

## Voice

Present tense, describing the system as it is. A page answers one question and
says where to look for the rest.

Write for a reader who knows the domain and has never seen this code. Name the
table, the service, the environment variable, the exported function. Do not
narrate the work that produced the current state: that belongs to the tracker
while it is open and to a shipped document once it is closed.

_Project-local. Rewrite this section in the project's own terms, and include
the vocabulary that is canonical here: the words this team uses for its
central objects, and the words it deliberately does not._

## Profiles

This wiki runs the profiles named in `wiki.profiles` in the profile. A profile
is an audience, and it decides what a page may assume rather than where the
page lives.

| Profile     | Audience                           | May assume                       |
| ----------- | ---------------------------------- | -------------------------------- |
| `technical` | someone who will change the code   | the stack, the repository layout |
| `business`  | someone who will not open the code | the domain, and nothing about it |

_Project-local. Delete the row for any profile this wiki does not run, and add
the ones it does. If the wiki runs one profile, say so and delete the table._

A page written for `business` names domain objects and outcomes. It does not
name a module, a queue or a migration, because its reader cannot act on those
and will not notice when they change. If a `business_subtree` is declared, that
subtree ships on its own, so no edge may leave it.

## Sections

A page of each kind is expected to carry these sections, in this order.

**A subject page.** The question the title asks, answered in one paragraph. The
mechanism. The names to grep for. Where the current state can be looked up, if
the page is tempted to state it.

**An index page.** One line per child saying what question that child answers.
No content of its own that a child could hold instead.

_Project-local. These two are a starting point. A project with runbooks,
integration pages or per-service pages should say what those carry, because a
consistent skeleton is what makes a wiki skimmable by someone who has not read
it before._

## What does not go in the wiki

Status, dates and progress. A sentence that will be false in a month and
carries nothing saying when it was written is the failure this whole system is
built around, and the wiki is where it lands most easily.

If a page needs to say what is currently in flight, link to the tracker instead
of restating it. The tracker is the only authority on what is intended and
whether it is done.
