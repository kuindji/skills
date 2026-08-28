---
title: Owners and write scope
parents: [profile]
children: []
related_pages: [validators/guard]
last_updated: 2026-08-28
---

An owner scope says what a given clone may write. A product says which
documents, tracker project and mode apply. They are separate axes and they do
not partition the same way: a shared package is owned by one clone and consumed
by every product, and the default owner claims everything no other owner
claimed, which is a complement that no union of globs expresses.

`resolveCurrentOwner` answers who this clone is, in a fixed order. A gitignored
`.agent-owner` file at the clone root, then the basename of the main working
tree, which `mainWorkTreeOf` reads out of git's common directory, then an
error. Git remotes are not consulted, since several clones of one repository
share an origin URL, and a worktree resolves to the clone it was made from
rather than to itself.

`ownerForPath` answers who owns a path, and the answer carries one of two
severities.

- A path another owner lists in its own `paths` is an error. Make that change
  in the clone that owns it, push, and pull it back.
- A path no explicit owner claims is a warning, whether a default owner takes
  it by complement or no default exists at all. Root configuration and
  lockfiles live there and every clone touches them, so one severity for both
  would refuse every dependency install, which is how a guard gets uninstalled.

The warning still fires, because nobody owning a path is not the same as
permission. It asks for the path to be given to an owner so the next change
gets a real answer.

At most one owner carries `default: true`, and an overlap between two explicit
owners is a schema error rather than a precedence rule to be resolved.

An owner that claims a path explicitly and marks it `shared: true` puts a
consumer blast-radius check in front of changes to it. Only the explicit claim
triggers it. A shared owner that is also the default would demand an audit of
every unclaimed file in the repository, nearly none of which has a consumer.

Single-clone repositories leave the block out, and this one does.

What enforces the scope at the moment a write is attempted is
[[validators/guard]].
