import { describe, expect, test } from "bun:test";
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run as docsFreeze } from "./docs-freeze";
import { run as docsValidate } from "./docs-validate";
import { run as guardGenerated } from "./guard-generated";
import { run as profileValidate } from "./profile-validate";
import { run as projectValidate } from "./project-validate";
import { EXIT } from "./report";
import { run as wikiValidate } from "./wiki-validate";

/**
 * The bins, end to end.
 *
 * Every test here goes through the same entry point a shell would: argument
 * strings in, printed lines and an exit code out. The library beneath is
 * covered by its own tests, so what is being checked is the wiring — that the
 * flags reach the rules, that the exit code says what happened, and that a
 * caller who cannot run the tool is told so differently from one whose
 * repository has problems.
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

async function scratch(files: Record<string, string>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "cli-"));
    await Bun.spawn([ "git", "init", "-q" ], { cwd: directory }).exited;
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
    const directory = await scratch(files);
    try {
        return await body(directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}

const PROFILE = `
wiki:
  root: docs/wiki
  profiles: [technical]
  path_citations: forbidden
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  lifecycle: ["specs/*.md"]
  live: ["/README.md"]
  tracker: ["tasks.md"]
`;

const TRACKER = `# Tasks

## Todo

## In progress

## Blocked

## Done
`;

const BASE = {
    "project-profile.yaml": PROFILE,
    "README.md": "# Scratch\n",
    "docs/tasks.md": TRACKER,
    "docs/wiki/README.md":
        "---\ntitle: Home\nparents: []\nchildren: []\nrelated_pages: []\nlast_updated: 2026-08-27\n---\n\nThe root page.\n",
    // A declared glob matching nothing is a warning of its own, so the base
    // repository carries one document of every class it declares.
    "docs/specs/2026-08-27-decision.md":
        "---\ntype: spec\nstatus: draft\n---\n\nBeing written.\n",
};

describe("project-validate", () => {
    test("a repository that follows its own profile passes", async () => {
        await withRepo(BASE, async (directory) => {
            const out = sink();
            const code = await projectValidate(
                [ "--repo", directory ],
                out.io,
            );
            expect(out.text()).toContain("no problems");
            expect(code).toBe(EXIT.ok);
        });
    });

    /**
     * A repository that cannot be read is not the same as one that failed its
     * rules, and a CI job that cannot tell them apart treats a tool pointed at
     * the wrong directory as a repository full of faults.
     */
    test("no profile is unusable, not failed, and says what to do", async () => {
        await withRepo({ "README.md": "# x\n" }, async (directory) => {
            const out = sink();
            const code = await projectValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.unusable);
            expect(out.text()).toContain("profile.missing");
            expect(out.text()).toContain("templates");
        });
    });

    test("one pass reports the profile, the wiki and the docs together", async () => {
        await withRepo(BASE, async (directory) => {
            const out = sink();
            await projectValidate([ "--repo", directory ], out.io);
            expect(out.text()).toContain("1 profile");
            expect(out.text()).toContain("1 page under docs/wiki");
            expect(out.text()).toContain("documents under docs");
        });
    });

    test("a doc that matches no class fails the run", async () => {
        await withRepo({
            ...BASE,
            "docs/2026-08-27-stray-plan.md": "# Stray\n",
        }, async (directory) => {
            const out = sink();
            const code = await projectValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("docs.unclassified");
        });
    });

    test("--json is one object carrying the same findings", async () => {
        await withRepo({
            ...BASE,
            "docs/2026-08-27-stray-plan.md": "# Stray\n",
        }, async (directory) => {
            const out = sink();
            const code = await projectValidate(
                [ "--repo", directory, "--json" ],
                out.io,
            );
            const parsed = JSON.parse(out.text());
            expect(code).toBe(EXIT.failed);
            expect(parsed.tool).toBe("project-validate");
            expect(parsed.errors).toBe(1);
            expect(parsed.diagnostics[0].rule).toBe("docs.unclassified");
        });
    });

    /**
     * Every rule downstream asks git for the list of files to check, so
     * without a repository they all fail on the same call — and they failed by
     * throwing, which printed a stack trace where a diagnostic belongs under
     * an exit code that says the repository broke a rule.
     */
    test("a directory outside any repository is refused, not crashed on", async () => {
        const directory = await mkdtemp(join(tmpdir(), "cli-nogit-"));
        try {
            await writeFile(
                join(directory, "project-profile.yaml"),
                PROFILE,
            );
            const out = sink();
            const code = await projectValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.unusable);
            expect(out.text()).toContain("cli.notARepository");
            expect(out.text()).not.toContain("at listRepoFiles");
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    test("an unknown flag refuses to run rather than ignoring it", async () => {
        const out = sink();
        expect(await projectValidate([ "--fix" ], out.io)).toBe(EXIT.unusable);
        expect(out.text()).toContain("Unknown option `--fix`.");
    });
});

describe("the single-subject validators", () => {
    test("profile-validate reports a pattern that guards nothing", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml":
                `${PROFILE}\ngenerated_paths: ["build/**"]\n`,
        }, async (directory) => {
            const out = sink();
            const code = await profileValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.ok);
            expect(out.text()).toContain("guard.deadGeneratedPath");
        });
    });

    test("wiki-validate checks the wiki and nothing else", async () => {
        await withRepo({
            ...BASE,
            "docs/2026-08-27-stray-plan.md": "# Stray\n",
            "docs/wiki/orders.md":
                "---\ntitle: Orders\nparents: [README]\nchildren: []\nrelated_pages: []\nlast_updated: 2026-08-27\n---\n\nSee lib/orders.ts:14 for the rate.\n",
        }, async (directory) => {
            const out = sink();
            const code = await wikiValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("docs/wiki/orders.md");
            expect(out.text()).not.toContain("docs.unclassified");
        });
    });

    test("docs-validate checks the docs and nothing else", async () => {
        await withRepo({
            ...BASE,
            "docs/2026-08-27-stray-plan.md": "# Stray\n",
            "docs/wiki/orders.md": "---\ntitle: Orders\n---\n\nNo parents.\n",
        }, async (directory) => {
            const out = sink();
            const code = await docsValidate([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("docs.unclassified");
            expect(out.text()).not.toContain("wiki.");
        });
    });

    /**
     * Two frames, one repository. `git ls-files` run in a subdirectory lists
     * paths relative to that subdirectory, so classification works and looks
     * correct, while `git log` names the same files relative to the repository
     * root, so no commit date matches a document and every age rule measures
     * nothing. Measured before this warning existed, a document last touched
     * in January 2024 under `review_after_days: 30` drew no diagnostic at all.
     */
    test("a directory inside a repo says age cannot be measured", async () => {
        await withRepo({
            ...BASE,
            "product/project-profile.yaml": `tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  live: ["guide.md"]
  review_after_days: 30
`,
            "product/docs/guide.md": "# Guide\n",
        }, async (directory) => {
            const out = sink();
            const code = await docsValidate(
                [ "--repo", join(directory, "product") ],
                out.io,
            );
            expect(code).toBe(EXIT.ok);
            expect(out.text()).toContain("cli.notRepositoryRoot");
            expect(out.text()).toContain("document age cannot be measured");
        });
    });

    /**
     * The wiki is repo-wide and a product profile cannot declare one, so a
     * product's documents have to be checked against the repository's wiki.
     * Read per profile instead, a product would have no slugs at all and every
     * shipped spec it owns would be told its `folded_into` names a page that
     * does not exist — the one rule that says the knowledge was preserved,
     * failing precisely where it was obeyed.
     */
    test("a product's fold gate resolves against the repo's wiki", async () => {
        await withRepo({
            ...BASE,
            "docs/wiki/orders.md":
                "---\ntitle: Orders\nparents: [README]\nchildren: []\nrelated_pages: []\nlast_updated: 2026-08-27\n---\n\nHow orders work.\n",
            "docs/wiki/README.md":
                "---\ntitle: Home\nparents: []\nchildren: [orders]\nrelated_pages: []\nlast_updated: 2026-08-27\n---\n\nThe root page.\n",
            "docs/quiz/project-profile.yaml": `product: quiz
paths: [apps/quiz]
docs:
  root: docs/quiz
  lifecycle: ["specs/*.md"]
`,
            "docs/quiz/specs/2026-08-27-scoring.md":
                "---\ntype: spec\nstatus: shipped\nfolded_into: [orders]\nfrozen_body_sha256: pending\n---\n\nHow scoring works.\n",
        }, async (directory) => {
            const out = sink();
            await docsValidate([ "--repo", directory ], out.io);
            expect(out.text()).not.toContain("docs.foldGate");
        });
    });
});

const SHIPPED = `---
type: spec
status: shipped
---

The decision.
`;

describe("docs-freeze", () => {
    test("writes the hash into a shipped document", async () => {
        await withRepo({
            ...BASE,
            "docs/specs/2026-08-27-thing.md": SHIPPED,
        }, async (directory) => {
            const out = sink();
            const code = await docsFreeze([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.ok);
            const written = await readFile(
                join(directory, "docs/specs/2026-08-27-thing.md"),
                "utf8",
            );
            expect(written).toContain("frozen_body_sha256:");
            expect(out.text()).toContain("frozen at");
        });
    });

    test("--dry-run reports the same thing and writes nothing", async () => {
        await withRepo({
            ...BASE,
            "docs/specs/2026-08-27-thing.md": SHIPPED,
        }, async (directory) => {
            const out = sink();
            const code = await docsFreeze(
                [ "--repo", directory, "--dry-run" ],
                out.io,
            );
            expect(code).toBe(EXIT.ok);
            expect(out.text()).toContain("would freeze");
            expect(
                await readFile(
                    join(directory, "docs/specs/2026-08-27-thing.md"),
                    "utf8",
                ),
            ).toBe(SHIPPED);
        });
    });

    /**
     * A sweep passes over open documents in silence — a specs directory is
     * mostly drafts — while naming a path is the author asserting it is ready,
     * and then the refusal is the answer they asked for.
     */
    test("a sweep ignores an open document; naming it explains", async () => {
        const draft = SHIPPED.replace("shipped", "draft");
        await withRepo({
            ...BASE,
            "docs/specs/2026-08-27-open.md": draft,
        }, async (directory) => {
            const swept = sink();
            expect(await docsFreeze([ "--repo", directory ], swept.io)).toBe(
                EXIT.ok,
            );
            expect(swept.text()).toContain("No shipped lifecycle document");

            const named = sink();
            const code = await docsFreeze([
                "--repo",
                directory,
                join(directory, "docs/specs/2026-08-27-open.md"),
            ], named.io);
            expect(code).toBe(EXIT.failed);
            expect(named.text()).toContain("freeze.notShipped");
        });
    });

    test("a second run leaves the document alone", async () => {
        await withRepo({
            ...BASE,
            "docs/specs/2026-08-27-thing.md": SHIPPED,
        }, async (directory) => {
            await docsFreeze([ "--repo", directory ], sink().io);
            const out = sink();
            const code = await docsFreeze([ "--repo", directory ], out.io);
            expect(code).toBe(EXIT.ok);
            expect(out.text()).toContain("already frozen");
        });
    });

    test("a live document is refused, whatever its name", async () => {
        await withRepo(BASE, async (directory) => {
            const out = sink();
            const code = await docsFreeze([
                "--repo",
                directory,
                join(directory, "README.md"),
            ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("freeze.notLifecycle");
        });
    });

    /**
     * Naming a path outside the repository stops the run rather than freezing
     * the rest of the set: acting on half of what was named while reporting
     * the other half leaves the caller guessing which half was written.
     */
    test("a path outside the repo stops the whole run", async () => {
        await withRepo({
            ...BASE,
            "docs/specs/2026-08-27-thing.md": SHIPPED,
        }, async (directory) => {
            const out = sink();
            const code = await docsFreeze([
                "--repo",
                directory,
                join(directory, "docs/specs/2026-08-27-thing.md"),
                "/etc/hosts",
            ], out.io);
            expect(code).toBe(EXIT.unusable);
            expect(out.text()).toContain("cli.outsideRepository");
            expect(
                await readFile(
                    join(directory, "docs/specs/2026-08-27-thing.md"),
                    "utf8",
                ),
            ).toBe(SHIPPED);
        });
    });
});

const GUARDED = `${PROFILE}
generated_paths: ["build/**"]
`;

describe("guard-generated", () => {
    test("refuses an edit to a generated path named absolutely", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
            "build/schema.ts": "// generated\n",
        }, async (directory) => {
            const out = sink();
            const code = await guardGenerated([
                "--repo",
                directory,
                join(directory, "build/schema.ts"),
            ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("guard.generatedPath");
        });
    });

    test("acknowledging the same path lets it through", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
            "build/schema.ts": "// generated\n",
        }, async (directory) => {
            const out = sink();
            const code = await guardGenerated([
                "--repo",
                directory,
                "--acknowledge",
                join(directory, "build/schema.ts"),
                join(directory, "build/schema.ts"),
            ], out.io);
            expect(code).toBe(EXIT.ok);
        });
    });

    test("naming paths and --base together is refused, not merged", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
            "build/schema.ts": "// generated\n",
        }, async (directory) => {
            const out = sink();
            const code = await guardGenerated([
                "--repo",
                directory,
                "--base",
                "main",
                join(directory, "build/schema.ts"),
            ], out.io);
            expect(code).toBe(EXIT.unusable);
            expect(out.text()).toContain("Pass one or the other.");
        });
    });

    test("a base ref that does not exist is a caller mistake, not a crash", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
        }, async (directory) => {
            const out = sink();
            const code = await guardGenerated(
                [ "--repo", directory, "--base", "definitely-not-a-ref" ],
                out.io,
            );
            expect(code).toBe(EXIT.unusable);
            expect(out.text()).toContain("guard.unreadableChange");
            expect(out.text()).toContain("Nothing was checked.");
        });
    });

    test("with no paths it reads the working tree's change", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
            "build/generated.ts": "// generated\n",
        }, async (directory) => {
            const out = sink();
            await guardGenerated([ "--repo", directory ], out.io);
            expect(out.text()).toContain("paths in the working tree's change");
        });
    });

    /**
     * The same file under two names. On macOS `/tmp` and `/var` are symlinks,
     * git reports the resolved form as the repository root, and a hook hands
     * over whichever form the editor holds; compared as text, the file is not
     * inside its own repository. Measured before this was fixed, a guard
     * pointed at `/var/folders/…/repo` refused
     * `/private/var/folders/…/repo/build/x.ts` as outside it — the exact
     * pre-write call the guard exists to answer.
     */
    test("a repo reached through a symlink is the same repo", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": GUARDED,
            "build/schema.ts": "// generated\n",
        }, async (directory) => {
            const link = `${directory}-link`;
            await symlink(directory, link);
            try {
                const out = sink();
                const code = await guardGenerated([
                    "--repo",
                    link,
                    join(directory, "build/schema.ts"),
                ], out.io);
                expect(out.text()).toContain("guard.generatedPath");
                expect(out.text()).not.toContain("cli.outsideRepository");
                expect(code).toBe(EXIT.failed);
            }
            finally {
                await rm(link, { force: true });
            }
        });
    });

    test("--owner refuses a write outside that clone's scope", async () => {
        await withRepo({
            ...BASE,
            "project-profile.yaml": `${PROFILE}
owners:
  main:
    paths: [docs]
    default: true
  notes:
    paths: [apps/notes]
  quiz:
    paths: [apps/quiz]
`,
            "apps/quiz/index.ts": "export {};\n",
        }, async (directory) => {
            const out = sink();
            const code = await guardGenerated([
                "--repo",
                directory,
                "--owner",
                "notes",
                join(directory, "apps/quiz/index.ts"),
            ], out.io);
            expect(code).toBe(EXIT.failed);
            expect(out.text()).toContain("Acting as `notes`");
        });
    });
});
