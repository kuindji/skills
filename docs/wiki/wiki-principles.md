# Wiki principles

Prose about this wiki rather than a page in it. Under this name, at the wiki
root, it carries no frontmatter and no edges, and `wiki-validate` does not read
it as a page.

`wiki-authoring` reads this file before writing anything. What it takes from
here is everything the validator cannot check: voice, which style profiles this
wiki runs, and the sections a page of each kind is expected to have.

The dividing line is mechanical. **If editing it would break a validator, it is
fixed in the skill. Otherwise it is here.** Frontmatter shape, link resolution,
bidirectional edges, reachability, the size budget and the position bans are
fixed, so nothing below restates them.

## Voice

Present tense, describing the system as it is. A page answers one question and
says where to look for the rest.

Write for someone who will change this code and has not seen it before. Name
the module, the exported function, the constant, the bin. This wiki declares
`path_citations: forbidden`, so a page names what lives somewhere rather than
where it lives, which is also what makes the page traceable by `wiki-drift`.

The vocabulary that is canonical here: a **profile** configures a repository or
a product in it; a **product** is a set of paths with its own documents,
tracker and mode; an **owner** is a clone and its write scope; a **bin** is one
runnable validator; a **class** is what a document's rules follow from; a
**page** is a node in this graph. A **name** is part of an interface and a
**position** is where something sits today, and this system spends most of its
rules on the difference.

Words this wiki does not use: "currently", "recently", "as of". They read as
true forever and nothing marks the moment they stopped being. The validator
warns on them, and a warning here means the sentence needs rewriting rather
than silencing.

## Profiles

This wiki runs one style profile, `technical`. Its reader will open the code,
so a page may assume the stack and the repository layout, and is expected to
carry the identifiers that make it greppable. There is no business subtree.

## Sections

**A subject page.** The question its title asks, answered in the first
paragraph. Then the mechanism, named module by named module. Then the reason
the mechanism is shaped that way, where a reader would otherwise be tempted to
simplify it back.

**An index page.** One line per child, saying what question that child answers.
No content of its own that a child could hold instead. The README is the only
index this wiki has so far, and its lines are written as answers rather than as
titles, because a list of titles is a table of contents and a reader already
has one of those.

## What does not go here

Status, dates and progress. Whether a piece of work is done lives in the
tracker the profile names, and every page here is written as though the work
that produced it never happened.
