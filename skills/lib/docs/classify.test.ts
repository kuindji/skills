import { describe, expect, test } from "bun:test";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import { checkTrackerCovered, classifyDocPaths } from "./classify";

function profileFrom(yaml: string): Profile {
    const result = parseProfile(yaml, "/repo/project-profile.yaml");
    if (!result.profile) {
        throw new Error(
            `fixture profile did not parse: ${
                JSON.stringify(result.diagnostics)
            }`,
        );
    }
    return result.profile;
}

const STANDARD = profileFrom(`
tracker:
  backend: in-repo
  file: docs/tasks.md
wiki:
  root: docs/wiki
docs:
  root: docs
  lifecycle: ["specs/*.md", "plans/*.md"]
  live: ["README.md"]
  tracker: ["tasks.md"]
  reference: ["research/**"]
  assets: ["branding/**"]
`);

describe("classification", () => {
    test("a file matching one class is classified as it", () => {
        const result = classifyDocPaths(STANDARD, [
            "docs/specs/2026-08-27-thing.md",
        ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files[0]?.docClass).toBe("lifecycle");
    });

    test("globs resolve relative to the docs root, not the repo root", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/README.md" ]);
        expect(result.files[0]?.docClass).toBe("live");
    });

    test("a nested reference glob matches at any depth", () => {
        const result = classifyDocPaths(STANDARD, [
            "docs/research/sources/01-teardown.md",
        ]);
        expect(result.files[0]?.docClass).toBe("reference");
    });

    test("a file matching no class is an error naming the classes", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/stray-note.md" ]);
        const d = result.diagnostics.find((d) =>
            d.rule === "docs.unclassified"
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("docs/stray-note.md");
        expect(d?.remedy).toContain("ignored");
    });

    test("a file matching two classes is an error naming both", () => {
        const overlapping = profileFrom(`
tracker:
  backend: clickup
docs:
  root: docs
  lifecycle: ["specs/*.md"]
  reference: ["specs/*.md"]
`);
        const result = classifyDocPaths(overlapping, [ "docs/specs/a.md" ]);
        const d = result.diagnostics.find((d) => d.rule === "docs.ambiguous");
        expect(d).toBeDefined();
        expect(d?.message).toContain("lifecycle");
        expect(d?.message).toContain("reference");
    });
});

describe("the wiki is not a doc class", () => {
    test("a wiki nested inside the docs root is skipped entirely", () => {
        const result = classifyDocPaths(STANDARD, [
            "docs/wiki/architecture.md",
            "docs/wiki/ui/design.md",
        ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files).toEqual([]);
    });

    test("a path merely starting with the wiki root name is not skipped", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/wiki-notes.md" ]);
        expect(result.diagnostics[0]?.rule).toBe("docs.unclassified");
    });
});

describe("the tracker class follows the backend", () => {
    test("declaring tracker globs with an external backend is an error", () => {
        const external = profileFrom(`
tracker:
  backend: clickup
docs:
  root: docs
  tracker: ["tasks.md"]
`);
        const result = classifyDocPaths(external, []);
        const d = result.diagnostics.find(
            (d) => d.rule === "docs.trackerClass",
        );
        expect(d).toBeDefined();
        expect(d?.remedy).toContain("clickup");
    });

    test("an in-repo tracker file must be classified as tracker", () => {
        const misfiled = profileFrom(`
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  live: ["tasks.md"]
`);
        const result = classifyDocPaths(misfiled, [ "docs/tasks.md" ]);
        const d = result.diagnostics.find(
            (d) => d.rule === "docs.trackerMisfiled",
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("live");
    });

    test("a correctly classified in-repo tracker passes", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/tasks.md" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files[0]?.docClass).toBe("tracker");
    });

    test("the tracker checks reach outside the docs root", () => {
        // Found by the gpt-5.5 review. A root-relative glob is how a tracker
        // at the repo root gets its class, and that branch skipped both
        // tracker checks entirely.
        const rootTracker = profileFrom(`
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  tracker: ["tasks.md", "/TODO.md"]
`);
        const result = classifyDocPaths(rootTracker, [
            "TODO.md",
            "docs/tasks.md",
        ]);
        const d = result.diagnostics.find(
            (d) => d.rule === "docs.trackerAuthority",
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("TODO.md");
    });

    test("a tracker at the repo root is not misfiled", () => {
        const rootTracker = profileFrom(`
tracker:
  backend: in-repo
  file: TODO.md
docs:
  root: docs
  tracker: ["/TODO.md"]
`);
        const result = classifyDocPaths(rootTracker, [ "TODO.md" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files[0]?.docClass).toBe("tracker");
    });

    test("a product profile does not report `undefined` as the tracker", () => {
        // `tracker.file` is repo-wide and only the root profile carries it, so
        // a product profile reading its own is reading nothing. It reported
        // the absence as a violation, naming `undefined` as the tracker the
        // file should have been.
        const product = parseProfile(
            `product: notes\npaths: ["apps/notes"]\ndocs:\n  root: apps/notes/docs\n  tracker: ["tasks.md"]\n`,
            "/repo/apps/notes/project-profile.yaml",
            { kind: "product", inherit: { trackerBackend: "in-repo" } },
        ).profile!;
        const result = classifyDocPaths(product, [
            "apps/notes/docs/tasks.md",
        ]);
        expect(result.diagnostics).toEqual([]);
    });

    test("the repo's tracker file can sit under a product's docs root", () => {
        const under = (trackerFile: string) =>
            parseProfile(
                `product: notes\npaths: ["apps/notes"]\ndocs:\n  root: apps/notes/docs\n  tracker: ["tasks.md"]\n  live: ["README.md"]\n`,
                "/repo/apps/notes/project-profile.yaml",
                {
                    kind: "product",
                    inherit: { trackerBackend: "in-repo", trackerFile },
                },
            ).profile!;

        const covered = classifyDocPaths(
            under("apps/notes/docs/tasks.md"),
            [ "apps/notes/docs/tasks.md" ],
        );
        expect(covered.diagnostics).toEqual([]);

        const elsewhere = classifyDocPaths(
            under("docs/tasks.md"),
            [ "apps/notes/docs/tasks.md" ],
        );
        const d = elsewhere.diagnostics.find(
            (d) => d.rule === "docs.trackerAuthority",
        );
        expect(d?.message).toContain("docs/tasks.md");
    });

    test("a second file in the tracker class is a second authority", () => {
        const twoTrackers = profileFrom(`
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  tracker: ["tasks.md", "backlog.md"]
`);
        const result = classifyDocPaths(twoTrackers, [
            "docs/tasks.md",
            "docs/backlog.md",
        ]);
        const d = result.diagnostics.find(
            (d) => d.rule === "docs.trackerAuthority",
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("docs/backlog.md");
        expect(d?.message).toContain("docs/tasks.md");
    });
});

describe("the tracker file is covered by a tracker glob", () => {
    test("a tracker no glob claims is an error naming what stopped", () => {
        // The rules of the tracker class run over files classified as
        // `tracker`, so a tracker file no glob matches is a file none of them
        // ever see. A repo can declare an in-repo backend, write the file, and
        // have every rule that makes "done" mean something silently not run.
        const uncovered = profileFrom(`
tracker:
  backend: in-repo
  file: TODO.md
docs:
  root: docs
  live: ["README.md"]
`);
        const found = checkTrackerCovered(uncovered, []);
        expect(found.map((d) => d.rule)).toEqual([ "docs.trackerUnchecked" ]);
        expect(found[0]?.message).toContain("TODO.md");
        expect(found[0]?.remedy).toContain("docs.tracker");
    });

    test("a claimed tracker reports nothing", () => {
        const found = checkTrackerCovered(STANDARD, [
            { path: "docs/tasks.md", docClass: "tracker" },
        ]);
        expect(found).toEqual([]);
    });

    test("the same file under another class does not count as claimed", () => {
        const found = checkTrackerCovered(STANDARD, [
            { path: "docs/tasks.md", docClass: "live" },
        ]);
        expect(found.map((d) => d.rule)).toEqual([ "docs.trackerUnchecked" ]);
    });

    test("an external backend has no file to cover", () => {
        const external = profileFrom("tracker:\n  backend: clickup\n");
        expect(checkTrackerCovered(external, [])).toEqual([]);
    });
});

describe("no docs configured", () => {
    test("a profile with no docs block classifies nothing and complains not", () => {
        const bare = profileFrom("tracker:\n  backend: clickup\n");
        const result = classifyDocPaths(bare, [ "docs/whatever.md" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files).toEqual([]);
    });
});

describe("dead globs", () => {
    test("a glob matching nothing is a warning when the scan is complete", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/README.md" ], {
            reportDeadGlobs: true,
        });
        const dead = result.diagnostics.filter(
            (d) => d.rule === "docs.deadGlob",
        );
        expect(dead.length).toBeGreaterThan(0);
        expect(dead[0]?.severity).toBe("warning");
        expect(dead[0]?.remedy).toContain("docs");
    });

    test("dead globs are not reported for a partial path list", () => {
        const result = classifyDocPaths(STANDARD, [ "docs/README.md" ]);
        expect(
            result.diagnostics.some((d) => d.rule === "docs.deadGlob"),
        ).toBe(false);
    });
});

describe("root-relative globs", () => {
    const withRoot = profileFrom(`
tracker:
  backend: clickup
docs:
  root: docs
  live: ["/README.md", "/AGENTS.md"]
  lifecycle: ["specs/*.md"]
`);

    test("a leading slash matches from the repo root", () => {
        const result = classifyDocPaths(withRoot, [ "README.md" ]);
        expect(result.files[0]?.docClass).toBe("live");
    });

    test("a file outside docs with no root glob is not swept for a class", () => {
        const result = classifyDocPaths(withRoot, [ "skills/lib/thing.ts" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files).toEqual([]);
    });
});

describe("what is not a document", () => {
    /**
     * The spec puts each product's profile at that product's docs root,
     * because that is what keeps each clone of a monorepo editing only files
     * it owns. Demanding a doc class for it would make the recommended layout
     * the one that fails.
     */
    test("a profile is configuration, not a document", () => {
        const result = classifyDocPaths(STANDARD, [
            "docs/quiz/project-profile.yaml",
        ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files).toEqual([]);
    });

    test("a path another profile has claimed is left to it", () => {
        const path = "docs/quiz/specs/2026-08-27-scoring.md";
        const unclaimed = classifyDocPaths(STANDARD, [ path ]);
        expect(unclaimed.diagnostics.map((d) => d.rule)).toEqual([
            "docs.unclassified",
        ]);

        const claimed = classifyDocPaths(STANDARD, [ path ], {
            claimed: new Set([ path ]),
        });
        expect(claimed.diagnostics).toEqual([]);
        expect(claimed.files).toEqual([]);
    });
});

/**
 * A docs root naming the repository root.
 *
 * Found by copying the product-profile template into a scratch repository:
 * the spec's own example writes `root: .`, which prefixed nothing, so the
 * profile classified zero documents while looking configured. Every document
 * it owned was then reported as unclassified by the profile above it, which
 * sends a reader to add globs to the wrong file.
 */
describe("a docs root at the repository root", () => {
    const AT_ROOT = profileFrom(`
tracker:
  backend: in-repo
  file: tasks.md
docs:
  root: .
  live: ["README.md"]
  tracker: ["tasks.md"]
`);

    test("classifies the files at the repository root", () => {
        const result = classifyDocPaths(AT_ROOT, [ "README.md", "tasks.md" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files.map((f) => f.docClass)).toEqual([
            "live",
            "tracker",
        ]);
    });

    test("sweeps the whole repository for files matching no class", () => {
        const result = classifyDocPaths(AT_ROOT, [ "src/index.ts" ]);
        expect(result.diagnostics.map((d) => d.rule)).toContain(
            "docs.unclassified",
        );
    });

    test("a dead glob names that root rather than an empty string", () => {
        const result = classifyDocPaths(AT_ROOT, [ "README.md" ], {
            reportDeadGlobs: true,
        });
        const dead = result.diagnostics.find((d) => d.rule === "docs.deadGlob");
        expect(dead?.remedy).toContain("the repository root");
        expect(dead?.remedy).not.toContain("``");
    });
});
