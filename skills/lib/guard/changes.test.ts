import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedPaths } from "./changes";

async function git(cwd: string, ...args: string[]): Promise<void> {
    const proc = Bun.spawn([ "git", ...args ], {
        cwd,
        stdout: "ignore",
        stderr: "ignore",
    });
    if (await proc.exited !== 0) {
        throw new Error(`git ${args.join(" ")} failed`);
    }
}

/** A throwaway repository, so the git-facing code is tested against real git. */
async function withRepo(
    body: (root: string) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "guard-changes-"));
    try {
        await git(root, "init", "-q", "-b", "main", ".");
        await git(root, "config", "user.email", "test@example.com");
        await git(root, "config", "user.name", "Test");
        await body(root);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function seed(root: string, files: Record<string, string>) {
    for (const [ path, body ] of Object.entries(files)) {
        await mkdir(join(root, path, ".."), { recursive: true });
        await writeFile(join(root, path), body);
    }
    await git(root, "add", "-A");
    await git(root, "commit", "-qm", "seed");
}

describe("what a working-tree change touches", () => {
    test("a clean tree touches nothing", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            expect(await changedPaths(root)).toEqual([]);
        });
    });

    test("an edited file is touched", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await writeFile(join(root, "a.ts"), "two\n");
            expect(await changedPaths(root)).toEqual([ "a.ts" ]);
        });
    });

    test("a staged edit is touched", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await writeFile(join(root, "a.ts"), "two\n");
            await git(root, "add", "-A");
            expect(await changedPaths(root)).toEqual([ "a.ts" ]);
        });
    });

    /**
     * Deleting a generated file is touching it. A guard that only looked at
     * what exists afterwards would let a deletion through.
     */
    test("a deleted file is touched", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n", "b.ts": "two\n" });
            await rm(join(root, "a.ts"));
            expect(await changedPaths(root)).toEqual([ "a.ts" ]);
        });
    });

    /**
     * The dangerous half of a rename is the side that disappears. Reporting
     * only the destination would let a generated file be renamed out of its
     * guarded directory without the guard ever seeing the guarded path.
     */
    test("a rename touches both the old path and the new one", async () => {
        await withRepo(async (root) => {
            await seed(root, { "gen/a.yaml": "x".repeat(200) + "\n" });
            await mkdir(join(root, "src"), { recursive: true });
            await writeFile(join(root, "src/a.yaml"), "x".repeat(200) + "\n");
            await rm(join(root, "gen/a.yaml"));
            await git(root, "add", "-A");
            expect(await changedPaths(root)).toEqual([
                "gen/a.yaml",
                "src/a.yaml",
            ]);
        });
    });

    /**
     * A newly written file is the most likely way an agent lands in a
     * generated directory, and it is invisible to `git diff` until staged.
     */
    test("an untracked new file is touched", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await mkdir(join(root, "gen"), { recursive: true });
            await writeFile(join(root, "gen/new.yaml"), "x\n");
            expect(await changedPaths(root)).toEqual([ "gen/new.yaml" ]);
        });
    });

    test("an ignored file is not reported as a change", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n", ".gitignore": "build/\n" });
            await mkdir(join(root, "build"), { recursive: true });
            await writeFile(join(root, "build/out.js"), "x\n");
            expect(await changedPaths(root)).toEqual([]);
        });
    });

    /**
     * git octal-escapes any path outside ASCII unless told not to. The escaped
     * form never matches a declared pattern, so the file silently passes every
     * rule the guard has.
     */
    test("a non-ASCII path survives intact", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await writeFile(join(root, "café.yaml"), "x\n");
            expect(await changedPaths(root)).toEqual([ "café.yaml" ]);
        });
    });

    test("a path with a space survives intact", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await writeFile(join(root, "two words.yaml"), "x\n");
            expect(await changedPaths(root)).toEqual([ "two words.yaml" ]);
        });
    });

    test("each path is reported once however many ways it changed", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await writeFile(join(root, "a.ts"), "two\n");
            await git(root, "add", "-A");
            await writeFile(join(root, "a.ts"), "three\n");
            expect(await changedPaths(root)).toEqual([ "a.ts" ]);
        });
    });

    /**
     * Before the first commit there is no HEAD to diff against, so the diff
     * pass reports nothing and staging a file also removes it from the
     * untracked list. Between the two, a file staged into a brand-new
     * repository was seen by neither, and the guard passed a generated path it
     * would have refused one commit later.
     */
    test("a staged file in a repository with no commits is touched", async () => {
        await withRepo(async (root) => {
            await mkdir(join(root, "gen"), { recursive: true });
            await writeFile(join(root, "gen/out.yaml"), "x\n");
            await git(root, "add", "-A");
            expect(await changedPaths(root)).toEqual([ "gen/out.yaml" ]);
        });
    });

    test("a repository with no commits reports its new files", async () => {
        await withRepo(async (root) => {
            await writeFile(join(root, "a.ts"), "one\n");
            expect(await changedPaths(root)).toEqual([ "a.ts" ]);
        });
    });
});

describe("what a branch changed", () => {
    test("only this branch's own changes, not the base's", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await git(root, "checkout", "-qb", "feature");
            await writeFile(join(root, "mine.ts"), "x\n");
            await git(root, "add", "-A");
            await git(root, "commit", "-qm", "mine");

            // The base moves on after the branch was cut. That file is not
            // part of what this branch changed, and blaming a guard failure on
            // it would send someone looking at a commit they did not write.
            await git(root, "checkout", "-q", "main");
            await writeFile(join(root, "theirs.ts"), "x\n");
            await git(root, "add", "-A");
            await git(root, "commit", "-qm", "theirs");
            await git(root, "checkout", "-q", "feature");

            expect(await changedPaths(root, { base: "main" })).toEqual([
                "mine.ts",
            ]);
        });
    });

    test("uncommitted work counts as part of the branch", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await git(root, "checkout", "-qb", "feature");
            await writeFile(join(root, "committed.ts"), "x\n");
            await git(root, "add", "-A");
            await git(root, "commit", "-qm", "c");
            await writeFile(join(root, "pending.ts"), "x\n");

            expect(await changedPaths(root, { base: "main" })).toEqual([
                "committed.ts",
                "pending.ts",
            ]);
        });
    });

    test("an unknown base is an error naming the base", async () => {
        await withRepo(async (root) => {
            await seed(root, { "a.ts": "one\n" });
            await expect(changedPaths(root, { base: "nope" })).rejects
                .toThrow(/nope/);
        });
    });
});
