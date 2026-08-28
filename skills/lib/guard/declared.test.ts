import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import { validateGeneratedPaths } from "./declared";

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

async function withRepo(
    files: Record<string, string>,
    body: (root: string) => Promise<void>,
): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "guard-declared-"));
    try {
        await git(root, "init", "-q", "-b", "main", ".");
        await git(root, "config", "user.email", "test@example.com");
        await git(root, "config", "user.name", "Test");
        for (const [ path, body ] of Object.entries(files)) {
            await mkdir(join(root, path, ".."), { recursive: true });
            await writeFile(join(root, path), body);
        }
        await git(root, "add", "-A");
        await git(root, "commit", "-qm", "seed");
        await body(root);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
}

function profileWith(patterns: string[]): Profile {
    const yaml = `tracker:\n  backend: clickup\ngenerated_paths:\n`
        + patterns.map((p) => `  - "${p}"\n`).join("");
    const result = parseProfile(yaml, "/repo/project-profile.yaml");
    if (!result.profile) {
        throw new Error(JSON.stringify(result.diagnostics));
    }
    return result.profile;
}

describe("whether a declared generated pattern is live", () => {
    test("a pattern matching a tracked file is live", async () => {
        await withRepo({ "hasura/tables.yaml": "x\n" }, async (root) => {
            expect(
                await validateGeneratedPaths(
                    root,
                    profileWith([
                        "hasura/**/*.yaml",
                    ]),
                ),
            ).toEqual([]);
        });
    });

    /**
     * The case the whole check exists for. Generated trees are gitignored
     * precisely because they are generated, so the most important patterns a
     * profile declares match nothing git will ever report. Measured against a
     * real Expo monorepo, all four of its declared patterns are in this state:
     * never tracked in 701 commits, and thousands of files on disk. Judging
     * them by the index alone would call every one of them dead and tell the
     * author to delete the only rules protecting those trees.
     */
    test("a pattern matching only an ignored file is live", async () => {
        await withRepo(
            { ".gitignore": "ios/\n", "src/a.ts": "x\n" },
            async (root) => {
                await mkdir(join(root, "ios"), { recursive: true });
                await writeFile(join(root, "ios/Podfile"), "x\n");
                expect(
                    await validateGeneratedPaths(
                        root,
                        profileWith([
                            "ios/**",
                        ]),
                    ),
                ).toEqual([]);
            },
        );
    });

    test("a pattern matching nothing at all is reported", async () => {
        await withRepo({ "src/a.ts": "x\n" }, async (root) => {
            const [ diagnostic ] = await validateGeneratedPaths(
                root,
                profileWith([ "hasura/**/*.yaml" ]),
            );
            expect(diagnostic?.rule).toBe("guard.deadGeneratedPath");
            expect(diagnostic?.message).toContain("hasura/**/*.yaml");
        });
    });

    /**
     * A warning: a pattern can be correct and match nothing yet, on a repo
     * whose generator has not been run in this clone.
     */
    test("a dead pattern is a warning, not a failure", async () => {
        await withRepo({ "src/a.ts": "x\n" }, async (root) => {
            const [ diagnostic ] = await validateGeneratedPaths(
                root,
                profileWith([ "nothing/**" ]),
            );
            expect(diagnostic?.severity).toBe("warning");
        });
    });

    test("each dead pattern is reported separately", async () => {
        await withRepo({ "src/a.ts": "x\n" }, async (root) => {
            const diagnostics = await validateGeneratedPaths(
                root,
                profileWith([ "a/**", "src/**", "b/**" ]),
            );
            expect(diagnostics.map((d) => d.keyPath)).toEqual([
                "generated_paths[0]",
                "generated_paths[2]",
            ]);
        });
    });

    /**
     * Dependencies are not the project's generated output, and walking them
     * makes the check slow enough that nobody runs it.
     */
    test("a match inside node_modules does not keep a pattern alive", async () => {
        await withRepo(
            { ".gitignore": "node_modules/\n", "src/a.ts": "x\n" },
            async (root) => {
                await mkdir(join(root, "node_modules/dep"), {
                    recursive: true,
                });
                await writeFile(
                    join(root, "node_modules/dep/expo-env.d.ts"),
                    "x\n",
                );
                const diagnostics = await validateGeneratedPaths(
                    root,
                    profileWith([ "**/expo-env.d.ts" ]),
                );
                expect(diagnostics).toHaveLength(1);
            },
        );
    });

    test("a project declaring none is silent", async () => {
        await withRepo({ "src/a.ts": "x\n" }, async (root) => {
            expect(await validateGeneratedPaths(root, profileWith([])))
                .toEqual([]);
        });
    });
});
