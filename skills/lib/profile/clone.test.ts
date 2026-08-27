import { describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { mainWorkTreeOf, resolveCurrentOwner } from "./clone";

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
);

describe("resolveCurrentOwner", () => {
    test("falls back to the clone directory name", async () => {
        expect(await resolveCurrentOwner(repoRoot)).toBe(basename(repoRoot));
    });

    test("resolves from a nested directory, not just the root", async () => {
        expect(await resolveCurrentOwner(join(repoRoot, "skills", "lib"))).toBe(
            basename(repoRoot),
        );
    });

    test("an .agent-owner marker wins over the directory name", async () => {
        const scratch = await mkdtemp(join(tmpdir(), "owner-"));
        try {
            await gitInit(scratch);
            await writeFile(join(scratch, ".agent-owner"), "baby-sleep\n");
            expect(await resolveCurrentOwner(scratch)).toBe("baby-sleep");
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
    });

    test("an empty marker falls through to the directory name", async () => {
        const scratch = await mkdtemp(join(tmpdir(), "owner-"));
        try {
            await gitInit(scratch);
            await writeFile(join(scratch, ".agent-owner"), "   \n");
            expect(await resolveCurrentOwner(scratch)).toBe(basename(scratch));
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
    });

    test("outside a git repository there is no owner", async () => {
        const scratch = await mkdtemp(join(tmpdir(), "not-a-repo-"));
        try {
            expect(await resolveCurrentOwner(scratch)).toBeUndefined();
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
    });
});

describe("mainWorkTreeOf", () => {
    test("a linked worktree resolves to the clone it came from", async () => {
        // realpath: on macOS /var is a symlink to /private/var, and git
        // reports the resolved form.
        const scratch = await realpath(await mkdtemp(join(tmpdir(), "clone-")));
        const worktree = join(scratch, "wt");
        try {
            await gitInit(scratch);
            await writeFile(join(scratch, "seed.txt"), "seed\n");
            await run(scratch, [ "git", "add", "-A" ]);
            await run(scratch, [
                "git",
                "-c",
                "user.email=t@t",
                "-c",
                "user.name=t",
                "commit",
                "-qm",
                "seed",
            ]);
            await run(scratch, [
                "git",
                "worktree",
                "add",
                "-q",
                worktree,
                "-b",
                "branch",
            ]);
            // The worktree's own directory is "wt"; the owner is the clone.
            expect(await mainWorkTreeOf(worktree)).toBe(scratch);
            expect(await resolveCurrentOwner(worktree)).toBe(basename(scratch));
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
    });
});

async function gitInit(dir: string) {
    await run(dir, [ "git", "init", "-q", "-b", "main" ]);
}

async function run(cwd: string, cmd: string[]) {
    const proc = Bun.spawn(cmd, { cwd, stdout: "ignore", stderr: "ignore" });
    const code = await proc.exited;
    if (code !== 0) {
        throw new Error(`${cmd.join(" ")} failed with ${code}`);
    }
}
