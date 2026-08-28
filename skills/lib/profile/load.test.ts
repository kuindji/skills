import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadProfiles } from "./load";

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
);

async function gitInit(directory: string): Promise<void> {
    await Bun.spawn([ "git", "init", "-q" ], { cwd: directory }).exited;
}

async function scratchRepo(
    files: Record<string, string>,
): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "load-"));
    await gitInit(directory);
    for (const [ path, content ] of Object.entries(files)) {
        const full = join(directory, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, content);
    }
    return directory;
}

async function withRepo<T>(
    files: Record<string, string>,
    body: (directory: string) => Promise<T>,
): Promise<T> {
    const directory = await scratchRepo(files);
    try {
        return await body(directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}

const ROOT = `
wiki:
  root: docs/wiki
  profiles: [technical]
  path_citations: forbidden
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  live: ["README.md"]
`;

describe("loadProfiles", () => {
    test("a repo with no profile reports the one thing to do about it", async () => {
        await withRepo({ "README.md": "# x\n" }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.index).toBeUndefined();
            expect(result.diagnostics).toHaveLength(1);
            expect(result.diagnostics[0]?.rule).toBe("profile.missing");
            expect(result.diagnostics[0]?.remedy).toContain("templates");
        });
    });

    test("a single root profile is the whole configuration", async () => {
        await withRepo({ "project-profile.yaml": ROOT }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics).toEqual([]);
            expect(result.index?.products).toEqual([]);
            expect(result.index?.root.wiki?.root).toBe("docs/wiki");
        });
    });

    test("product profiles are found wherever they sit", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\n",
            "backend/portal/project-profile.yaml":
                "product: portal\npaths: [backend/portal]\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics).toEqual([]);
            expect(result.index?.products.map((p) => p.product)).toEqual([
                "portal",
                "notes",
            ]);
        });
    });

    test("a nested repo-wide profile is a boundary, not a product", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "fixtures/sample/project-profile.yaml": ROOT,
            "fixtures/sample/docs/quiz/project-profile.yaml":
                "product: quiz\npaths: [apps/quiz]\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.boundaries).toEqual([ "fixtures/sample" ]);
            expect(result.index?.products).toEqual([]);
            expect(result.diagnostics).toEqual([]);
        });
    });

    test("a boundary hides only what is under it", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "fixtures/sample/project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.boundaries).toEqual([ "fixtures/sample" ]);
            expect(result.index?.products.map((p) => p.product)).toEqual([
                "notes",
            ]);
        });
    });

    /**
     * A directory whose name merely starts with a boundary's name is not
     * inside it. `fixtures/sample-app` sharing seven characters with
     * `fixtures/sample` is not a reason to stop reading it.
     */
    test("a sibling sharing a prefix with a boundary is still read", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "fixtures/sample/project-profile.yaml": ROOT,
            "fixtures/sample-app/project-profile.yaml":
                "product: sample-app\npaths: [apps/sample]\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.index?.products.map((p) => p.product)).toEqual([
                "sample-app",
            ]);
        });
    });

    test("a product profile keeps its own product-level settings", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\nroadmap: ./milestones.md\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics).toEqual([]);
            expect(result.index?.products[0]?.roadmap).toBe("./milestones.md");
        });
    });

    /**
     * The boundary rule is a silent skip, so it must not swallow the mistake
     * it most resembles: a repo-wide key typed into a product profile. Naming
     * a product is what tells the two apart.
     */
    test("a named product carrying a repo-wide key is reported, not skipped", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\nwiki:\n  root: docs/notes/wiki\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.boundaries).toEqual([]);
            const rules = result.diagnostics.map((d) => d.rule);
            expect(rules).toContain("schema.rootOnlyKey");
        });
    });

    /**
     * Where task state lives is a property of the repository. Parsed on its
     * own, a product profile fell back to the `in-repo` default, so under a
     * Linear or ClickUp root every rule that asks where tasks live got the
     * wrong answer for that product — including the one that reports a
     * `tracker` doc class declared against an external backend.
     */
    test("a product inherits the repo's tracker backend", async () => {
        await withRepo({
            "project-profile.yaml": `
wiki:
  root: docs/wiki
tracker:
  backend: linear
`,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\ntracker:\n  project: notes\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics).toEqual([]);
            expect(result.index?.products[0]?.tracker.backend).toBe("linear");
            expect(result.index?.products[0]?.tracker.project).toBe("notes");
        });
    });

    test("a product declaring its own backend is refused", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\ntracker:\n  backend: linear\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics.map((d) => d.rule)).toContain(
                "tracker.rootOnlyBackend",
            );
        });
    });

    test("a product inherits the repository's tracker file", async () => {
        // Every skill starts by resolving the profile that governs a path, so
        // a product profile that cannot answer where the tracker is sends the
        // reader looking for a file the profile does not name.
        await withRepo({
            "project-profile.yaml":
                "tracker:\n  backend: in-repo\n  file: docs/tasks.md\n",
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics).toEqual([]);
            expect(result.index?.products[0]?.tracker.file).toBe(
                "docs/tasks.md",
            );
        });
    });

    test("a product declaring its own tracker file is refused", async () => {
        // Found by the second gpt-5.5 review. The tracker file is repo-wide,
        // and everything that reads it now reads the root profile's, so a
        // product declaring one was setting a key nothing would ever act on.
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml":
                "product: notes\npaths: [apps/notes]\ntracker:\n"
                + "  file: docs/notes/tasks.md\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.diagnostics.map((d) => d.rule)).toContain(
                "tracker.rootOnlyFile",
            );
        });
    });

    /**
     * A nested repository need not declare a wiki or owners to be one. The
     * smallest real profile is a tracker and a docs root, and read as a
     * product profile it would claim this repo's paths.
     */
    test("a nested repo declaring only a tracker is still a boundary", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "fixtures/minimal/project-profile.yaml":
                "tracker:\n  backend: in-repo\n  file: docs/tasks.md\ndocs:\n  root: docs\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.boundaries).toEqual([ "fixtures/minimal" ]);
            expect(result.diagnostics).toEqual([]);
        });
    });

    /**
     * Unreadable YAML must not be mistaken for a boundary. The skip is silent
     * by design, so a profile that vanished into it would take its syntax
     * error along.
     */
    test("a broken nested profile reports its syntax error", async () => {
        await withRepo({
            "project-profile.yaml": ROOT,
            "docs/notes/project-profile.yaml": "product: [notes\n",
        }, async (directory) => {
            const result = await loadProfiles(directory);
            expect(result.boundaries).toEqual([]);
            expect(result.diagnostics.map((d) => d.rule)).toContain(
                "schema.parse",
            );
        });
    });

    test("outside a repository the root profile is read and the gap named", async () => {
        const directory = await mkdtemp(join(tmpdir(), "load-nogit-"));
        try {
            await writeFile(join(directory, "project-profile.yaml"), ROOT);
            const result = await loadProfiles(directory);
            expect(result.index?.root.wiki?.root).toBe("docs/wiki");
            expect(result.diagnostics.map((d) => d.rule)).toEqual([
                "profile.notARepository",
            ]);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

/**
 * The corpus check. This repo carries three fixture repositories under
 * `skills/lib/fixtures/`, and reading them as its own products is the failure
 * the boundary rule exists to prevent.
 */
describe("this repo loads as one product", () => {
    test("its own profile, three boundaries, no diagnostics", async () => {
        const result = await loadProfiles(repoRoot);
        expect(result.diagnostics).toEqual([]);
        expect(result.index?.products).toEqual([]);
        expect(result.boundaries.sort()).toEqual([
            "skills/lib/fixtures/mature-single-product",
            "skills/lib/fixtures/multi-product",
        ]);
    });
});
