import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProfile } from "../profile/parse";
import { validateLiveDocs } from "./live";
import { validateDocs } from "./scan";

const NOW = new Date("2026-08-27T00:00:00Z");

function dates(entries: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(entries));
}

describe("review age", () => {
    test("a document committed inside the window is not flagged", () => {
        const diagnostics = validateLiveDocs([ "README.md" ], {
            reviewAfterDays: 90,
            commitDates: dates({ "README.md": "2026-07-01T00:00:00Z" }),
            now: NOW,
        });
        expect(diagnostics).toEqual([]);
    });

    test("a document past the window is flagged for review", () => {
        const diagnostics = validateLiveDocs([ "README.md" ], {
            reviewAfterDays: 90,
            commitDates: dates({ "README.md": "2026-01-01T00:00:00Z" }),
            now: NOW,
        });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.reviewAge");
        expect(diagnostics[0]?.file).toBe("README.md");
        expect(diagnostics[0]?.message).toContain("238 days");
    });

    /**
     * A warning, because a document can be both untouched and correct. The
     * check knows when someone last looked, never whether the prose is true.
     */
    test("the flag asks for a read, it does not fail the repo", () => {
        const [ diagnostic ] = validateLiveDocs([ "README.md" ], {
            reviewAfterDays: 30,
            commitDates: dates({ "README.md": "2026-01-01T00:00:00Z" }),
            now: NOW,
        });
        expect(diagnostic?.severity).toBe("warning");
    });

    test("the boundary day itself is inside the window", () => {
        const onTheDay = validateLiveDocs([ "README.md" ], {
            reviewAfterDays: 90,
            commitDates: dates({ "README.md": "2026-05-29T00:00:00Z" }),
            now: NOW,
        });
        expect(onTheDay).toEqual([]);
    });

    test("an uncommitted document has no history to be stale against", () => {
        expect(
            validateLiveDocs([ "README.md" ], {
                reviewAfterDays: 90,
                commitDates: new Map(),
                now: NOW,
            }),
        ).toEqual([]);
    });
});

const PROFILE = `wiki:
  root: docs/wiki
  profiles: [technical]
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  lifecycle: []
  live: ["/README.md"]
  tracker: ["tasks.md"]
  review_after_days: 90
`;

/**
 * The end-to-end path, because the unit above cannot catch the wiring: a
 * repo with no lifecycle documents at all used to return before any other
 * class was looked at.
 */
describe("against a real repository", () => {
    test("a live README nobody has committed for months is flagged", async () => {
        const root = await mkdtemp(join(tmpdir(), "docs-live-"));
        try {
            await mkdir(join(root, "docs"), { recursive: true });
            await writeFile(join(root, "README.md"), "# A project\n");
            await writeFile(join(root, "docs", "tasks.md"), "## Todo\n");
            await writeFile(join(root, "project-profile.yaml"), PROFILE);

            for (
                const args of [
                    [ "init", "-q", "." ],
                    [ "config", "user.email", "test@example.com" ],
                    [ "config", "user.name", "Test" ],
                    [ "add", "-A" ],
                ]
            ) {
                const proc = Bun.spawn([ "git", ...args ], {
                    cwd: root,
                    stdout: "ignore",
                    stderr: "ignore",
                });
                if (await proc.exited !== 0) {
                    throw new Error(`git ${args.join(" ")} failed`);
                }
            }
            const commit = Bun.spawn([ "git", "commit", "-qm", "start" ], {
                cwd: root,
                stdout: "ignore",
                stderr: "ignore",
                env: {
                    ...process.env,
                    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
                    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
                },
            });
            if (await commit.exited !== 0) {
                throw new Error("git commit failed");
            }

            const file = join(root, "project-profile.yaml");
            const { profile } = parseProfile(PROFILE, file);
            const result = await validateDocs(profile!, root, { now: NOW });

            expect(result.lifecycle).toEqual([]);
            expect(result.diagnostics.map((d) => d.rule)).toEqual([
                "docs.reviewAge",
            ]);
            expect(result.diagnostics[0]?.file).toBe("README.md");
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
