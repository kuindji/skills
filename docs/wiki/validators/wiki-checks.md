---
title: How a wiki page is checked
parents: [validators]
children: []
related_pages: []
last_updated: 2026-08-28
---

`validateWiki` is the whole run. `loadWikiPages` reads every markdown file
under the declared wiki root, `parseWikiPage` splits each into frontmatter and
body, and the two rule sets go over the result. A declared root that is absent
or empty is a warning rather than an error, so a repository can state its
intent before it has written a page.

`isWikiPage` is what keeps the principles file out of the graph. Under either
of its two sanctioned names, at the root and nowhere deeper, it is prose about
the wiki rather than a page in it, so validating it as a page would report an
orphan on the one file explaining what an orphan is.

**Every rule that reads a body has to decide whether code counts, and they do
not all answer the same way.** `bodyLines` splits each line into three views so
that each rule says which it means instead of reimplementing Markdown and
getting a different answer. The line as written, which is what a directory tree
is matched against, since a tree inside a fence is the thing being banned
rather than an exception to it. The line with fences blanked, which is where
citations are counted, because the citation convention is written in inline
code. And the line with inline spans blanked as well, which is the page read as
English, where a wikilink is an edge and `if [[ -f config ]]` is a command.

`validateWikiGraph` holds the shape. Frontmatter is exactly five keys, a sixth
being a second and quieter copy of the page. Every slug in `parents`,
`children` and `related_pages` resolves, and every edge is declared from both
ends. A child lives under its parent's directory, so the tree on disk and the
graph are one structure. The README is the root, has no parents, and lists
every top-level page. Reachability is a walk from the README over `children`
and body links, downward only, which is why declaring a parent is not enough on
its own. `WARN_WORDS` and `MAX_WORDS` are the budget, and either one means the
page answers more than one question.

`validateWikiProse` holds the positions. It reports a line number or a rendered
directory tree as an error, and a snapshot word as a warning, since the same
words are sometimes load-bearing. It counts file-path references under either
policy and reports them as errors only where the profile says `forbidden`, so
the inventory stays visible in a project that has sanctioned the practice.
