# Fixtures

Repository shapes this one cannot produce. This repo is a single product with
no owners block, no roadmap, one wiki profile and an empty wiki, so rules
validated only against it would fit only it.

These are test data. Nothing here is installed into those repositories and
nothing in them is read.

## Profiles

| Fixture                  | Exercises                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `multi-product/`         | Four products, an owners block with a complement default, a shared owner, per-product roadmaps, per-path mode overrides, Linear. |
| `mature-single-product/` | Dual wiki profiles with a self-contained business subtree, an external tracker, mature mode, no roadmap.                         |

## Wiki

Two page graphs, for the rules that need files on disk rather than literals.

| Fixture        | Exercises                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `wiki/clean/`  | A graph that satisfies every rule, plus a `PRINCIPLES.md` that must not be read as a page, and a self-contained subtree. |
| `wiki/broken/` | One instance of each failure, every one of them copied from a violation found in a real wiki rather than invented here.  |
