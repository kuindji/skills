import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { daysSince, isShallowRepository, lastCommitDates } from "./git";
import { listRepoFiles } from "./scan";

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

/** Commit at a fixed date, so a test asserting on dates is not time-dependent. */
async function commit(
    cwd: string,
    message: string,
    date: string,
): Promise<void> {
    const proc = Bun.spawn([ "git", "commit", "-qm", message ], {
        cwd,
        stdout: "ignore",
        stderr: "ignore",
        env: {
            ...process.env,
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_DATE: date,
        },
    });
    if (await proc.exited !== 0) {
        throw new Error(`git commit failed`);
    }
}

/** A throwaway repository, so the git-facing code is tested against real git. */
async function withRepo(
    body: (root: string) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "docs-git-"));
    try {
        await git(root, "init", "-q", ".");
        await git(root, "config", "user.email", "test@example.com");
        await git(root, "config", "user.name", "Test");
        await body(root);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
}

describe("commit dates", () => {
    test("a repository with no commits yet is not an error", async () => {
        await withRepo(async (root) => {
            expect(await lastCommitDates(root)).toEqual(new Map());
        });
    });

    test("the most recent commit wins for a file touched twice", async () => {
        await withRepo(async (root) => {
            await writeFile(join(root, "a.md"), "one\n");
            await git(root, "add", "-A");
            await git(
                root,
                "commit",
                "-qm",
                "first",
                "--date",
                "2026-01-01T00:00:00Z",
            );
            await writeFile(join(root, "a.md"), "two\n");
            await git(root, "add", "-A");
            await git(root, "commit", "-qm", "second");

            const dates = await lastCommitDates(root);
            expect(dates.get("a.md")!.startsWith("2026-01-01")).toBe(false);
        });
    });

    // `git log --name-only` shows no file list at all for a merge commit
    // unless merge diffs are asked for, so a document whose only recent change
    // arrived through a merge keeps the date of the commit before it and is
    // reported stale months early.
    test("a change made in a merge commit counts", async () => {
        await withRepo(async (root) => {
            const doc = join(root, "plan.md");
            await writeFile(doc, "Original\n");
            await git(root, "add", "-A");
            await commit(root, "base", "2026-01-01T00:00:00Z");

            await git(root, "checkout", "-q", "-b", "feature");
            await writeFile(join(root, "other.txt"), "f\n");
            await git(root, "add", "-A");
            await commit(root, "feature", "2026-08-20T00:00:00Z");

            await git(root, "checkout", "-q", "-");
            await git(root, "merge", "--no-ff", "--no-commit", "-q", "feature");
            await writeFile(doc, "Touched while merging\n");
            await git(root, "add", "-A");
            await commit(root, "merge", "2026-08-26T00:00:00Z");

            const dates = await lastCommitDates(root);
            expect(dates.get("plan.md")!.startsWith("2026-08-26")).toBe(true);
        });
    });

    // Git octal-escapes any path outside ASCII by default, and the escaped
    // form never matches the real one, so the file silently has no commit date
    // and can never be reported stale.
    test("a non-ASCII filename keeps its real path", async () => {
        await withRepo(async (root) => {
            await mkdir(join(root, "docs"), { recursive: true });
            await writeFile(join(root, "docs", "café.md"), "body\n");
            await writeFile(join(root, "docs", "a b.md"), "body\n");
            await git(root, "add", "-A");
            await git(root, "commit", "-qm", "one");

            const dates = await lastCommitDates(root);
            expect(dates.has("docs/café.md")).toBe(true);
            expect(dates.has("docs/a b.md")).toBe(true);

            const files = await listRepoFiles(root);
            expect(files.sort()).toEqual([ "docs/a b.md", "docs/café.md" ]);
        });
    });
});

describe("shallow clones", () => {
    test("a full repository is not shallow", async () => {
        await withRepo(async (root) => {
            await writeFile(join(root, "a.md"), "one\n");
            await git(root, "add", "-A");
            await commit(root, "one", "2026-01-01T00:00:00Z");
            expect(await isShallowRepository(root)).toBe(false);
        });
    });

    // A CI checkout defaults to a depth of one, so this is the ordinary case
    // there, and staleness measured against it would be fiction.
    test("a depth-one clone is shallow", async () => {
        await withRepo(async (source) => {
            await writeFile(join(source, "a.md"), "one\n");
            await git(source, "add", "-A");
            await commit(source, "one", "2026-01-01T00:00:00Z");
            await writeFile(join(source, "a.md"), "two\n");
            await git(source, "add", "-A");
            await commit(source, "two", "2026-08-20T00:00:00Z");

            const shallow = await mkdtemp(join(tmpdir(), "docs-git-shallow-"));
            try {
                await git(
                    shallow,
                    "clone",
                    "-q",
                    "--depth",
                    "1",
                    `file://${source}`,
                    ".",
                );
                expect(await isShallowRepository(shallow)).toBe(true);
            }
            finally {
                await rm(shallow, { recursive: true, force: true });
            }
        });
    });

    test("a directory that is not a repository is not shallow", async () => {
        const scratch = await mkdtemp(join(tmpdir(), "docs-not-a-repo-"));
        try {
            expect(await isShallowRepository(scratch)).toBe(false);
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
    });
});

describe("daysSince", () => {
    const now = new Date("2026-08-27T12:00:00Z");

    test("counts whole days", () => {
        expect(daysSince("2026-08-20T12:00:00Z", now)).toBe(7);
    });

    // A file git has never seen has no history to be stale against, which is
    // a different answer from "zero days old".
    test("an absent date is undefined, not zero", () => {
        expect(daysSince(undefined, now)).toBeUndefined();
    });

    test("an unparseable date is undefined", () => {
        expect(daysSince("last Tuesday", now)).toBeUndefined();
    });
});
