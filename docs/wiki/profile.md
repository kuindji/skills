---
title: The profile
parents: [README]
children: [profile/owners, profile/doc-classes]
related_pages: []
last_updated: 2026-08-29
---

Every rule in this package is read out of a profile, so nothing runs until one
is found. A profile is a YAML file whose name is fixed by `PROFILE_FILENAME`,
and `loadProfiles` walks the repository for every copy of it.

A profile declares the wiki root and its policies, where task state lives if it
lives anywhere, which paths are generated, the document class globs, and the
mode that governs a path. Every block is droppable, and a block left out says
this repository does not have that thing rather than that somebody forgot it: no
`wiki` means the wiki rules do not run, and no `tracker` means nothing here
answers what is intended or whether it is done. What is not allowed is a block
half written, so a `tracker` naming no backend is an error where an absent one
is not. A repository with one product puts all of that in a single file at the
root. A repository with several gives each product its own file and keeps only
the repository-wide keys at the root, and `parseProfile` refuses a product
profile that declares one of them. Two products disagreeing about where the
tracker lives would each be right about their own documents and wrong about the
repository they share.

**Resolution is by glob, not by directory ancestry.** `buildProductIndex` reads
the `paths` field off every product and builds the index that `productForPath`
answers from, and `modeForPath` answers the same way. `claims` is the matcher,
and `patternsCollide` is the check that no two products could ever name the
same file, which is a stronger question than whether the patterns are spelled
alike. Anything unclaimed falls back to the root profile acting as the default
product.

Ancestry cannot express the shape this system is for. One product owns an app
directory, a set of packages matching a pattern, and a documents directory
sitting nowhere near either, and a file under a shared parent has no profile
above it belonging to only one of them.

**A profile that names no product is a boundary.** `looksLikeRepositoryRoot`
reads a file that declares repository-wide settings and no products as another
repository's root, so it and everything beneath it are skipped. Vendored
checkouts and test fixtures are the common case. Every run prints the
boundaries it skipped, because a silent skip is only trustworthy if it names
what it passed over.

Recognising one got harder when the tracker became droppable, because a nested
root carrying only a documents root and a mode has no repository-wide key left
to be known by. So the test also asks what the document claims: `paths`, a
`roadmap` and a `tracker.project` are a product's own settings, and a file
carrying any of them is claiming to be a product however badly it is written.
An unnamed one is then reported as `products.unnamed` rather than skipped, which
is the point. The boundary rule is a silent skip, and the mistake it most
resembles is a product profile with a key missing.

Two things the profile carries answer questions of their own.
[[profile/owners]] is a separate axis from products and partitions the
repository differently. [[profile/doc-classes]] is what turns a directory of
documents into something a validator can judge at all.
