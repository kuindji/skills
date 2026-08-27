import { describe, expect, test } from "bun:test";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import { classifyDocPaths } from "./classify";

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
});

describe("no docs configured", () => {
    test("a profile with no docs block classifies nothing and complains not", () => {
        const bare = profileFrom("tracker:\n  backend: clickup\n");
        const result = classifyDocPaths(bare, [ "docs/whatever.md" ]);
        expect(result.diagnostics).toEqual([]);
        expect(result.files).toEqual([]);
    });
});
