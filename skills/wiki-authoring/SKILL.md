---
name: wiki-authoring
description: Use when creating or editing a page under a project's wiki root, when a change lands on a mature-mode path, when a greenfield milestone closes, or when wiki-validate reports frontmatter, symmetry, reachability, size or position problems.
---

# Wiki authoring

The wiki answers **why, and where to look**, in the present tense, rewritten in
place. It is not a changelog, a status report or a record of what you just did.
The reasoning is in [the spine](../doctrine.md#the-spine) and
[one authoritative home per fact](../doctrine.md#one-authoritative-home-per-fact).

## Which sentences belong here

| Sentence                                              | Home                            |
| ----------------------------------------------------- | ------------------------------- |
| Pricing reads the rate table on every request         | the wiki                        |
| We are moving pricing off the legacy table            | the tracker, or nowhere         |
| We picked the rate table over per-item prices because | a spec under the docs root      |
| p95 was 240ms on the build of the 12th                | a checklist, or the finish note |
| Pricing was moved off the legacy table in August      | nowhere                         |

The last row is the one that gets written anyway. The wiki says what is true
now, so the migration that produced it is either still true, in which case say
it without the date, or finished, in which case it is history and the page is
about the system rather than about the work.

The second row reads "or nowhere" because a repository may declare no tracker. A
wiki page is not the fallback: where nothing answers what is intended, the page
still only says what is true now, and the sentence about work in flight simply
does not get written.

## Read before writing

1. Resolve the profile that governs the path, by the rule in
   [finding the profile](../doctrine.md#finding-the-profile-that-applies), and
   say which one out loud. Take
   `wiki.root`, `wiki.profiles`, `wiki.path_citations` and
   `wiki.business_subtree` from it. Two projects here hold opposite policies on
   file paths in prose, so read
   [the policy](../doctrine.md#names-and-positions) rather than assuming one.
2. Read `PRINCIPLES.md` or `wiki-principles.md` at the wiki root if one is
   there. Neither is a page. Voice, sections and which profiles the wiki runs
   belong to the project, not to this skill. See
   [fixed versus project-local](../doctrine.md#fixed-versus-project-local).
3. Find the page that already covers the subject. Grep the wiki for the names
   involved, then read the README's `children`. **Editing an existing page is
   the default.** A new page is for a subject with no home, not for a home that
   is inconvenient.
4. Resolve the mode of the path you are documenting and say it out loud. It
   decides when the page has to land. The answer is in
   [mode](../doctrine.md#mode) and is not repeated here, because a rule written
   twice drifts.

## The page

Frontmatter is exactly five keys. A sixth is an error rather than an extra,
because it becomes a second, quieter copy of the page that goes stale on its
own.

```yaml
---
title: Orders
parents: [services]
children: [services/orders/refunds]
related_pages: [business/pricing]
last_updated: 2026-08-28
---
```

A slug is the file's path under the wiki root without `.md`, so
`services/orders.md` is `services/orders`. The three edge lists are lists of
slugs, present even when empty, written `[]`. `last_updated` is the date of this
edit as `YYYY-MM-DD`; housekeeping subtracts it from the age of the code.

Then the body: one paragraph answering the question the title asks, the
mechanism, and the names to grep for. One question per page.

## Edges

Every slug in the three lists resolves to a page, and every edge is declared
from both ends, both of which are your edit. Adding `services/orders/refunds`
to `children` means opening that page and adding `services/orders` to its
`parents`. The same holds for `related_pages`, in both files.

- A child lives under its parent's directory. The tree on disk and the graph are
  one structure, which is what makes splitting mechanical.
- The README is the root, has no parents, and lists every top-level page in its
  `children`. Every other page names at least one parent, and a page the README
  does not reach is unreachable whatever it declares. An empty wiki's first page
  is its README.
- `[[slug]]` in the body is a real edge and has to resolve. Inside code, fenced
  or inline, it is an example and reaches nothing.
- A declared `business_subtree` ships on its own, so no edge may leave it. The
  one exception is its index naming the README as parent. Pages outside it may
  link in; only the outward direction is dead wherever the subtree ships.

## Names, not positions

Name the table, the service, the environment variable, the exported function,
the route, the queue. Do not cite a line number or draw a directory tree; both
are errors, and the reasoning, including what is deliberately still allowed, is
in [names and positions](../doctrine.md#names-and-positions).

Decay is only half of it. A page written in positions is invisible to
housekeeping, which finds drift by grepping the names off a page.

## When a page outgrows its budget

Over 700 words of body is a warning, over 1,000 an error. Both mean it answers
more than one question. Split it: move each independent section to its own page
under a directory named after this slug, leave one bullet per child behind, and
update `parents` and `children` on everything you touched.

The README splits the other way. Its children have to be top-level pages, so a
section leaving it becomes `<topic>.md` at the wiki root, never
`README/<topic>.md`, which the validator rejects.

Do not trim instead. Trimming keeps the same number of subjects and deletes the
detail that made them worth writing down.

## Finish

```
bunx wiki-validate
```

Exit 0, or the page is not written. If this package is the repository you are in
rather than a dependency of it, the bin is not on the path and the same run is
`bun run skills/bin/wiki-validate.ts`. Warnings do not fail the run and are still
findings: a size warning is a split you have not done yet, and a snapshot
warning is a sentence that will read as true forever.

Stop if you catch yourself thinking:

- "I will add the other end of the edge in a follow-up." Half an edge leaves the
  parent index claiming something untrue.
- "A new page is easier than editing that long one." That is the split rule, and
  it moves sections under the existing slug rather than creating a sibling.
- "The path rule is noise in this repo." It is the project's declared policy.
- "Currently", "recently", "as of". Describe the mechanism, and say where the
  current state can be looked up.
