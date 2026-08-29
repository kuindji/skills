---
title: The skills
parents: [README]
children: []
related_pages: []
last_updated: 2026-08-29
---

Four skills, each firing at a moment rather than on a subject. `wiki-authoring`
fires when a page under the wiki root is created or edited. `project-docs`
fires when a spec, plan, research note or handover is written, and again when
one ships. `task-tracking` fires at task start, and at any tracker write it has
been asked for. `housekeeping` fires on request, at a once-a-week-or-two
cadence.

They share one file they all link into, the doctrine, which holds why each rule
exists. The skills say how a rule is followed and the doctrine says what makes
it worth following. Neither restates the other, because a rule written in two
places drifts, and then whichever copy an agent reads first wins.

**A skill is a file with a fixed contract, and the contract is code.**
`parseSkill` reads the frontmatter and `checkSkill` holds the shape: a `name`
matching the directory the file sits in, a `description` under
`MAX_DESCRIPTION_CHARS` saying when the skill fires rather than what it is
about, and a single level-one heading. `checkSkillLinks` walks every relative
link and every heading anchor in the prose and resolves each against the file
it points at, with `headingSlugs` computing the anchors a target actually
offers. A skill whose link into the doctrine has rotted is a skill that has
quietly stopped teaching the rule it was linking to.

That contract is enforced in this package's own tests rather than in a bin. The
skills ship inside the package, so a consuming repository has no copy of them
to check and nothing to run a checker over.

**What a project owns is a template, not a skill.** The dividing line is
mechanical: if editing it would break a validator it is fixed in the skill,
otherwise it is a template the project copies once and then owns. The templates
are the root profile, a product profile, the tracker file, the house rules, the
wiki principles, and the block that goes into a consuming repository's agent
instructions. Voice, which wiki profiles a wiki runs, section conventions and
every stack-specific convention live in those.

Whether an agent records work in the tracker as a matter of course is decided
the same way, and it is the clearest case of the rule. A profile key saying
"track everything here" would be a setting no validator could ever check,
because nothing observes whether an agent volunteered a write. So the answer
lives in the consuming repository's agent instructions, and the package's own
default is that an agent records what it is asked to record and nothing else.

A template is the one thing here that is never run where it is written, so the
only honest measure of one is a repository that copied it. That measure is a
test, described in [[testing]].
