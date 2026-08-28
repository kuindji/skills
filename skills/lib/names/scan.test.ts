import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import { scanDrift } from "./scan";

/**
 * The worklist against a real repository, which is where the parts that
 * cannot be unit-tested live: what counts as a file worth searching, and
 * whether the dates come from git rather than from a checkout.
 */

const PROFILE = `
wiki:
  root: docs/wiki
  profiles: [technical]
docs:
  root: docs
  lifecycle: [specs/*.md]
  live: [/README.md]
  tracker: [tasks.md]
tracker:
  backend: in-repo
  file: docs/tasks.md
generated_paths:
  - src/generated/**
`;

interface Scratch {
    directory: string;
    profile: Profile;
}

async function scratch(files: Record<string, string>): Promise<Scratch> {
    const directory = await mkdtemp(join(tmpdir(), "drift-"));
    const write = async (path: string, content: string) => {
        const full = join(directory, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, content);
    };
    for (const [ path, content ] of Object.entries(files)) {
        await write(path, content);
    }
    await write("project-profile.yaml", PROFILE);

    const git = async (...args: string[]) => {
        await Bun.spawn([ "git", ...args ], {
            cwd: directory,
            stdout: "ignore",
            stderr: "ignore",
            env: {
                ...process.env,
                GIT_AUTHOR_NAME: "t",
                GIT_AUTHOR_EMAIL: "t@t",
                GIT_COMMITTER_NAME: "t",
                GIT_COMMITTER_EMAIL: "t@t",
            },
        }).exited;
    };
    await git("init", "-q");
    await git("add", "-A");
    await git("commit", "-qm", "one", "--date=2026-08-20T09:00:00Z");

    const { profile } = parseProfile(
        PROFILE,
        `${directory}/project-profile.yaml`,
    );
    if (!profile) {
        throw new Error("the fixture profile does not parse");
    }
    return { directory, profile };
}

function page(lastUpdated: string, body: string): string {
    return [
        "---",
        "title: Orders",
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

async function withScratch<T>(
    files: Record<string, string>,
    body: (s: Scratch) => Promise<T>,
): Promise<T> {
    const s = await scratch(files);
    try {
        return await body(s);
    }
    finally {
        await rm(s.directory, { recursive: true, force: true });
    }
}

const NOW = new Date("2026-08-28T00:00:00Z");

/**
 * A date recent enough that the age fallback does not fire, so an exclusion
 * test measures the exclusion rather than the clock.
 */
const RECENT = "2026-08-25";

/**
 * Every scratch repository carries one file outside the wiki, the docs root
 * and the exclusions: the profile itself. So a run that searched nothing it
 * was meant to skip searched exactly one file.
 */
const ONLY_THE_PROFILE = 1;

/** Every file the sweep decided to watch, across all pages. */
function watchedBy(result: { queued: Entry[]; quiet: Entry[]; }): string[] {
    return [ ...result.queued, ...result.quiet ]
        .flatMap((entry) => entry.watched)
        .sort();
}

interface Entry {
    watched: string[];
}

describe("what the sweep searches", () => {
    test("a page is traced to the code holding its names", async () => {
        await withScratch(
            {
                "docs/wiki/orders.md": page(
                    "2026-05-02",
                    "Pricing reads `rate_table` on every request.",
                ),
                "src/pricing.ts": "export const rate_table = 'rates';\n",
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(profile, directory, {
                    now: NOW,
                });
                expect(result.queued.map((e) => e.slug)).toEqual([ "orders" ]);
                expect(result.queued[0]?.changed).toEqual([ "src/pricing.ts" ]);
            },
        );
    });

    /**
     * The wiki cannot be its own evidence. A page's names appear in the page,
     * and in every other page discussing the same subject, so searching the
     * wiki would report that every page is drifting from itself.
     */
    test("the wiki is not searched", async () => {
        // The wiki sits outside the docs root here, which is the shape that
        // separates this rule from the one below it. Nested under `docs/`,
        // the common layout, the docs exclusion would cover the wiki anyway
        // and this test would pass without the rule it names.
        await withScratch(
            {
                "wiki/orders.md": page(RECENT, "Pricing reads `rate_table`."),
                "wiki/pricing.md": page(RECENT, "The `rate_table` again."),
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(
                    { ...profile, wiki: { ...profile.wiki!, root: "wiki" } },
                    directory,
                    { now: NOW },
                );
                expect(watchedBy(result)).toEqual([]);
                expect(result.queued).toEqual([]);
            },
        );
    });

    /** Documents are not code, and a spec naming a table is not the table. */
    test("the docs root is not searched", async () => {
        await withScratch(
            {
                "docs/wiki/orders.md": page(
                    RECENT,
                    "Pricing reads `rate_table`.",
                ),
                "docs/specs/2026-08-20-pricing.md": "About `rate_table`.\n",
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(profile, directory, {
                    now: NOW,
                });
                expect(watchedBy(result)).toEqual([]);
            },
        );
    });

    /**
     * Generated output moves whenever its generator runs, so a page watching
     * it would be queued by every build rather than by a change anyone made.
     */
    test("generated paths are not searched", async () => {
        await withScratch(
            {
                "docs/wiki/orders.md": page(
                    RECENT,
                    "Pricing reads `rate_table`.",
                ),
                "src/generated/schema.ts": "export type rate_table = never;\n",
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(profile, directory, {
                    now: NOW,
                });
                expect(watchedBy(result)).toEqual([]);
                expect(result.searched).toBe(ONLY_THE_PROFILE);
            },
        );
    });

    /**
     * A lockfile is a list of every package name in the dependency tree and
     * it changes on every install, so any page naming a package would be
     * queued forever by a file nobody wrote.
     */
    test("lockfiles are not searched", async () => {
        await withScratch(
            {
                "docs/wiki/orders.md": page(RECENT, "It uses `typescript`."),
                "bun.lock": '{"typescript": "5.9.2"}\n',
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(profile, directory, {
                    now: NOW,
                });
                expect(watchedBy(result)).toEqual([]);
                expect(result.searched).toBe(ONLY_THE_PROFILE);
            },
        );
    });

    test("a binary file is not searched", async () => {
        await withScratch(
            {
                "docs/wiki/orders.md": page(RECENT, "The `logo_mark`."),
                "src/logo.png": "logo_mark binary-ish\n",
            },
            async ({ directory, profile }) => {
                const result = await scanDrift(profile, directory, {
                    now: NOW,
                });
                expect(watchedBy(result)).toEqual([]);
                expect(result.searched).toBe(ONLY_THE_PROFILE);
            },
        );
    });
});

/**
 * Extraction accepts a dotted name, `schema.table` or `process.env`, because
 * that is how a page writes one. The index has to hold the same shape or the
 * page is silently untraceable: the token is in the source file, the page
 * names it exactly, and the lookup misses because the two halves of the tool
 * disagree about where a name ends.
 */
test("a dotted name is traced", async () => {
    await withScratch(
        {
            "docs/wiki/orders.md": page(
                "2026-05-02",
                "Pricing reads `analytics.rate_table`.",
            ),
            "src/pricing.ts":
                "export const q = 'select * from analytics.rate_table';\n",
        },
        async ({ directory, profile }) => {
            const result = await scanDrift(profile, directory, { now: NOW });
            expect(result.queued[0]?.watched).toEqual([ "src/pricing.ts" ]);
        },
    );
});

/**
 * And the segments stay indexed on their own, which is what a page naming the
 * bare table rather than the qualified one relies on.
 */
test("a bare name still matches a dotted use", async () => {
    await withScratch(
        {
            "docs/wiki/orders.md": page(
                "2026-05-02",
                "Pricing reads `rate_table`.",
            ),
            "src/pricing.ts":
                "export const q = 'select * from analytics.rate_table';\n",
        },
        async ({ directory, profile }) => {
            const result = await scanDrift(profile, directory, { now: NOW });
            expect(result.queued[0]?.watched).toEqual([ "src/pricing.ts" ]);
        },
    );
});

/**
 * A docs-only repository declares its docs root as the repository root, which
 * the profile normalises to the empty string meaning "everything is under it".
 * A check that skipped an empty root would search every document in the repo
 * as though it were code, and a spec being edited would then read as the code
 * moving under a page.
 *
 * Nothing is searched instead, which is the honest answer: there is no code
 * here to trace against, so the worklist is ordered by age and says so.
 */
test("a docs root at the repository root excludes everything", async () => {
    await withScratch(
        {
            "docs/wiki/orders.md": page(
                "2026-05-02",
                "Pricing reads `rate_table`.",
            ),
            "docs/specs/2026-08-20-pricing.md": "About `rate_table`.\n",
        },
        async ({ directory, profile }) => {
            const result = await scanDrift(
                { ...profile, docs: { ...profile.docs!, root: "" } },
                directory,
                { now: NOW },
            );
            expect(result.searched).toBe(0);
            expect(watchedBy(result)).toEqual([]);
        },
    );
});

/**
 * In a shallow clone the commit dates are not the real ones: everything older
 * than the boundary reports the boundary commit's date, which is recent. Every
 * traced page then looks like churn, and the run says so with the same
 * confidence it would have had over real history. CI checks out at a depth of
 * one by default, so this is the ordinary case there rather than an exotic one.
 */
test("a shallow clone is reported, because its dates are not real", async () => {
    await withScratch(
        {
            "docs/wiki/orders.md": page(
                "2026-05-02",
                "Pricing reads `rate_table`.",
            ),
            "src/pricing.ts": "export const rate_table = 'rates';\n",
        },
        async ({ directory, profile }) => {
            const full = await scanDrift(profile, directory, { now: NOW });
            expect(full.shallow).toBe(false);

            const clone = await mkdtemp(join(tmpdir(), "drift-shallow-"));
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
                const result = await scanDrift(profile, clone, { now: NOW });
                expect(result.shallow).toBe(true);
            }
            finally {
                await rm(clone, { recursive: true, force: true });
            }
        },
    );
});

/**
 * A repository with no wiki gets a worklist with nothing in it rather than an
 * error. That is the ordinary shape of a project that has not written one
 * yet, and a sweep that fails there teaches the project to stop sweeping.
 */
test("no wiki is not a failure", async () => {
    // The pages are on disk and the profile does not declare them, which is
    // what makes this a test of the declaration rather than of the directory.
    await withScratch(
        {
            "docs/wiki/orders.md": page(RECENT, "It reads `rate_table`."),
            "src/pricing.ts": "export const rate_table = 'rates';\n",
        },
        async ({ directory, profile }) => {
            const result = await scanDrift(
                { ...profile, wiki: undefined },
                directory,
                { now: NOW },
            );
            expect(result.queued).toEqual([]);
            expect(result.pages).toBe(0);
        },
    );
});
