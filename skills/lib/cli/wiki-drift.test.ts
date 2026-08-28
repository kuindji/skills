import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { EXIT } from "./report";
import { run as wikiDrift } from "./wiki-drift";

/**
 * The one bin that reports rather than judges, end to end.
 *
 * Its exit code is the thing worth pinning. A queued page is not a fault: the
 * worklist is a heuristic, and a tool that failed a build over one would be
 * asking CI to enforce a grep. So a run that produced a list exits 0, and only
 * a run that could not happen at all exits 2.
 */

function sink() {
    const lines: string[] = [];
    return {
        io: {
            out: (line: string) => lines.push(line),
            err: (line: string) => lines.push(line),
        },
        text: () => lines.join("\n"),
    };
}

const PROFILE = `
wiki:
  root: docs/wiki
  profiles: [technical]
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  lifecycle: ["specs/*.md"]
  live: ["/README.md"]
  tracker: ["tasks.md"]
`;

function page(lastUpdated: string, body: string): string {
    return [
        "---",
        "title: A page",
        "parents: []",
        "children: []",
        "related_pages: []",
        `last_updated: ${lastUpdated}`,
        "---",
        "",
        body,
        "",
    ].join("\n");
}

async function withRepo<T>(
    files: Record<string, string>,
    body: (directory: string) => Promise<T>,
): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), "drift-cli-"));
    for (const [ path, content ] of Object.entries(files)) {
        const full = join(directory, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, content);
    }
    const env = {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
    };
    const git = async (...args: string[]) => {
        await Bun.spawn([ "git", ...args ], {
            cwd: directory,
            stdout: "ignore",
            stderr: "ignore",
            env,
        }).exited;
    };
    await git("init", "-q");
    await git("add", "-A");
    await git("commit", "-qm", "one");
    try {
        return await body(directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/** A repository whose one page names something the code moved under it. */
const DRIFTED = {
    "project-profile.yaml": PROFILE,
    "README.md": "# Scratch\n",
    "docs/tasks.md":
        "# Tasks\n\n## Todo\n\n## In progress\n\n## Blocked\n\n## Done\n",
    "docs/wiki/README.md": page(
        "2020-01-01",
        "The index. See [[orders]].",
    ),
    "docs/wiki/orders.md": page(
        "2020-01-01",
        "Pricing reads `rate_table` on every request.",
    ),
    "src/pricing.ts": "export const rate_table = 'rates';\n",
};

describe("the worklist", () => {
    test("names the queued page, its reason, and what moved", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const { io, text } = sink();
            const code = await wikiDrift([ "--repo", directory ], io);
            expect(code).toBe(EXIT.ok);
            expect(text()).toContain("orders");
            expect(text()).toContain("src/pricing.ts");
            expect(text()).toContain("churn");
        });
    });

    test("a queued page is not a failure", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const { io } = sink();
            expect(await wikiDrift([ "--repo", directory ], io)).toBe(EXIT.ok);
        });
    });

    test("--json emits the whole list, unordered by the terminal", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const { io, text } = sink();
            const code = await wikiDrift(
                [ "--repo", directory, "--json" ],
                io,
            );
            expect(code).toBe(EXIT.ok);
            const parsed = JSON.parse(text());
            expect(parsed.tool).toBe("wiki-drift");
            expect(parsed.pages).toBe(2);
            expect(parsed.queued[0].slug).toBe("orders");
            expect(parsed.queued[0].changed).toEqual([ "src/pricing.ts" ]);
        });
    });

    /**
     * A sweep is an afternoon, not a fortnight. The prose form is the list
     * somebody works through, so it is cut to a length somebody can work
     * through, and it says what it cut.
     */
    test("--limit cuts the prose list and says how much it cut", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const { io, text } = sink();
            const code = await wikiDrift(
                [ "--repo", directory, "--limit", "1" ],
                io,
            );
            expect(code).toBe(EXIT.ok);
            expect(text()).toContain("1 more");
        });
    });

    /**
     * Three ways to be untraceable and they are not the same sentence. A page
     * with no date has names that may all resolve perfectly: nothing about it
     * could be diffed, because there was no date to diff against. Telling its
     * author their names are gone from the repository sends them to rename
     * things that are exactly where the page says they are.
     */
    test("an undated page is not told its names are missing", async () => {
        await withRepo(
            {
                ...DRIFTED,
                "docs/wiki/orders.md": [
                    "---",
                    "title: Orders",
                    "parents: []",
                    "children: []",
                    "related_pages: []",
                    "---",
                    "",
                    "Pricing reads `rate_table` on every request.",
                    "",
                ].join("\n"),
            },
            async (directory) => {
                const { io, text } = sink();
                await wikiDrift([ "--repo", directory ], io);
                expect(text()).toContain("no usable date");
                expect(text()).not.toContain("none of them is in the");
                // The count, not the list: the files are what a dated run
                // would have diffed, and naming them here would read as a
                // finding about them.
                expect(text()).toContain("1 file would have been watched");
            },
        );
    });

    /**
     * A run over truncated history reports churn on everything, and prints it
     * in the same voice it uses for a real finding. Saying so is the whole
     * remedy: there is nothing the tool can do about the dates it was given.
     */
    test("a shallow clone is said out loud", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const clone = await mkdtemp(join(tmpdir(), "drift-cli-shallow-"));
            try {
                await Bun.spawn([
                    "git",
                    "clone",
                    "-q",
                    "--depth",
                    "1",
                    `file://${directory}`,
                    clone,
                ], { stdout: "ignore", stderr: "ignore" }).exited;

                const { io, text } = sink();
                expect(await wikiDrift([ "--repo", clone ], io))
                    .toBe(EXIT.ok);
                expect(text()).toContain("shallow clone");

                const deep = sink();
                await wikiDrift([ "--repo", directory ], deep.io);
                expect(deep.text()).not.toContain("shallow clone");
            }
            finally {
                await rm(clone, { recursive: true, force: true });
            }
        });
    });

    /**
     * A worklist over nothing is still a worklist, and it looks exactly like a
     * traced one that found no churn. The difference is the entire meaning of
     * the output, so the run says which it is.
     */
    test("a run with nothing to search says the list is age alone", async () => {
        await withRepo(
            {
                ...DRIFTED,
                "project-profile.yaml": PROFILE.replace(
                    "  root: docs\n",
                    '  root: "."\n',
                ).replace(
                    'lifecycle: ["specs/*.md"]',
                    'lifecycle: ["docs/specs/*.md"]',
                )
                    .replace(
                        'tracker: ["tasks.md"]',
                        'tracker: ["docs/tasks.md"]',
                    )
                    .replace('live: ["/README.md"]', 'live: ["README.md"]'),
            },
            async (directory) => {
                const { io, text } = sink();
                expect(await wikiDrift([ "--repo", directory ], io))
                    .toBe(EXIT.ok);
                expect(text()).toContain("0 files searched");
                expect(text()).toContain("Nothing outside the wiki");
            },
        );
    });

    /**
     * The prose form reports the loader's own findings under the list. The
     * JSON form is read by something that cannot see the prose, so dropping
     * them there means a machine consumer cannot tell a sweep that measured
     * what it claims from one that could not.
     *
     * The finding used here is the one that matters most to this tool: run
     * against a subdirectory, git reports commit dates against paths that do
     * not match, so every date the worklist rests on is absent.
     */
    test("--json carries the loader findings the prose form prints", async () => {
        await withRepo(
            {
                ...DRIFTED,
                "nested/project-profile.yaml": PROFILE,
                "nested/docs/tasks.md":
                    "# Tasks\n\n## Todo\n\n## In progress\n\n## Blocked\n\n## Done\n",
                "nested/README.md": "# Nested\n",
            },
            async (directory) => {
                const nested = join(directory, "nested");

                const prose = sink();
                await wikiDrift([ "--repo", nested ], prose.io);
                expect(prose.text()).toContain("cli.notRepositoryRoot");

                const { io, text } = sink();
                await wikiDrift([ "--repo", nested, "--json" ], io);
                const rules = JSON.parse(text()).diagnostics
                    ?.map((d: { rule: string; }) => d.rule);
                expect(rules).toContain("cli.notRepositoryRoot");
            },
        );
    });

    /**
     * A page whose names reach no file was not traced, and the summary counted
     * it as though it had been. It is quiet only because it is younger than
     * the age threshold: the same page a fortnight later is reported
     * untraceable. So the window where the count is wrong is the window where
     * somebody has just written the page and is most likely to believe it.
     */
    test("a page nothing could be traced on is not counted as traced", async () => {
        const today = new Date().toISOString().slice(0, 10);
        await withRepo(
            {
                ...DRIFTED,
                "docs/wiki/README.md": page(
                    today,
                    "The index. See [[orders]].",
                ),
                "docs/wiki/orders.md": page(
                    today,
                    "Describe the mechanism, never the position.",
                ),
            },
            async (directory) => {
                const { io, text } = sink();
                expect(await wikiDrift([ "--repo", directory ], io))
                    .toBe(EXIT.ok);
                expect(text()).toContain("2 pages untraced");
                expect(text()).not.toContain("2 pages traced and unchanged");
            },
        );
    });

    test("--limit refuses a value that is not a count", async () => {
        await withRepo(DRIFTED, async (directory) => {
            const { io, text } = sink();
            const code = await wikiDrift(
                [ "--repo", directory, "--limit", "lots" ],
                io,
            );
            expect(code).toBe(EXIT.unusable);
            expect(text()).toContain("--limit");
        });
    });
});

describe("when there is nothing to sweep", () => {
    test("a repository with no wiki says so and exits 0", async () => {
        await withRepo(
            {
                "project-profile.yaml": `
tracker:
  backend: in-repo
  file: docs/tasks.md
`,
                "docs/tasks.md":
                    "# Tasks\n\n## Todo\n\n## In progress\n\n## Blocked\n\n## Done\n",
            },
            async (directory) => {
                const { io, text } = sink();
                const code = await wikiDrift([ "--repo", directory ], io);
                expect(code).toBe(EXIT.ok);
                expect(text()).toContain("No wiki declared");
            },
        );
    });

    test("a repository it cannot read exits unusable", async () => {
        const directory = await mkdtemp(join(tmpdir(), "drift-bare-"));
        try {
            await Bun.spawn([ "git", "init", "-q" ], { cwd: directory }).exited;
            const { io } = sink();
            expect(await wikiDrift([ "--repo", directory ], io))
                .toBe(EXIT.unusable);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
