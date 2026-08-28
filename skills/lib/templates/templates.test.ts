import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run as projectValidate } from "../cli/project-validate";
import { EXIT } from "../cli/report";
import { buildProductIndex } from "../profile/index";
import { loadProfiles, TEMPLATE_PATH } from "../profile/load";
import { parseProfile } from "../profile/parse";

/**
 * The files a project copies out of this package, held to what they promise.
 *
 * A template is the one thing here that is never run where it is written, so
 * nothing else in this repo touches it: the profile templates are not loaded,
 * because discovery would then read them as configuration, and the markdown
 * ones are not skills. Everything checkable about them is checked here.
 *
 * The walking is in this file rather than in a module of its own for the same
 * reason the SKILL.md contract's is: there is one caller and it is this file.
 * A consuming repository has no `skills/templates/`, so none of this travels
 * with the package.
 */

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
);

const TEMPLATES = "skills/templates";

const PACKAGE_PREFIX = "node_modules/@kuindji/project-skills/";

async function read(path: string): Promise<string> {
    return await Bun.file(`${repoRoot}/${path}`).text();
}

/** Every file in the template directory, as tracked paths would list them. */
const MARKDOWN = [
    "AGENTS-block.md",
    "house-rules.md",
    "tasks.md",
    "wiki-principles.md",
];

const PROFILES = [
    "project-profile.template.yaml",
    "product-profile.template.yaml",
];

describe("the profile templates", () => {
    test("the root template is a valid root profile", async () => {
        const result = parseProfile(
            await read(`${TEMPLATES}/project-profile.template.yaml`),
            "project-profile.yaml",
        );
        expect(result.diagnostics.map((d) => `${d.keyPath}: ${d.message}`))
            .toEqual([]);
        expect(result.profile?.tracker.backend).toBe("in-repo");
        expect(result.profile?.docs?.globs.tracker).toEqual([ "tasks.md" ]);
    });

    test("the product template is a valid product profile", async () => {
        const result = parseProfile(
            await read(`${TEMPLATES}/product-profile.template.yaml`),
            "docs/notes-app/project-profile.yaml",
            { kind: "product" },
        );
        expect(result.diagnostics.map((d) => `${d.keyPath}: ${d.message}`))
            .toEqual([]);
        expect(result.profile?.product).toBe("notes-app");
    });

    /**
     * Separately valid is not the claim the templates make. A repository that
     * copies both gets an index built from the pair, and the rules that only
     * exist across profiles, an unnamed product, a product claiming nothing,
     * two products claiming the same path, are checked nowhere else.
     */
    test("the pair builds a product index with nothing to report", async () => {
        const root = parseProfile(
            await read(`${TEMPLATES}/project-profile.template.yaml`),
            "project-profile.yaml",
        ).profile;
        const product = parseProfile(
            await read(`${TEMPLATES}/product-profile.template.yaml`),
            "docs/notes-app/project-profile.yaml",
            { kind: "product" },
        ).profile;
        expect(root).toBeDefined();
        expect(product).toBeDefined();
        const index = buildProductIndex(root!, [ product! ]);
        expect(index.diagnostics.map((d) => d.message)).toEqual([]);
    });
});

describe("what the templates point at", () => {
    /**
     * A relative link is correct where the template sits and broken the
     * moment it is copied, which is the only moment that matters: the file
     * lands in another repository, at another depth, next to none of the
     * things it linked to. So a template names this package by its dependency
     * path or it does not name it at all.
     */
    test("no template carries a relative link", async () => {
        const found: string[] = [];
        for (const name of MARKDOWN) {
            const source = await read(`${TEMPLATES}/${name}`);
            for (const [ index, line ] of source.split("\n").entries()) {
                for (const match of line.matchAll(/\]\(([^)]+)\)/g)) {
                    const target = match[1] ?? "";
                    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
                        continue;
                    }
                    found.push(`${name}:${index + 1}: ${target}`);
                }
            }
        }
        expect(found).toEqual([]);
    });

    /**
     * Every path a template names inside this package resolves. The AGENTS.md
     * block is a table of them, so a skill renamed here silently empties the
     * one file every agent reads unprompted.
     */
    test("every package path a template names is there", async () => {
        const missing: string[] = [];
        for (const name of [ ...MARKDOWN, ...PROFILES ]) {
            const source = await read(`${TEMPLATES}/${name}`);
            const escaped = PACKAGE_PREFIX.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            for (
                const match of source.matchAll(
                    new RegExp(`${escaped}([A-Za-z0-9_./-]+)`, "g"),
                )
            ) {
                const path = (match[1] ?? "").replace(/\/$/, "");
                if (!await Bun.file(`${repoRoot}/${path}`).exists()) {
                    // A directory is not a file, and `Bun.file` cannot tell
                    // the difference, so a path with no extension is asked
                    // for as a directory listing instead.
                    const glob = new Bun.Glob(`${path}/*`);
                    const entries = [ ...glob.scanSync({ cwd: repoRoot }) ];
                    if (entries.length === 0) {
                        missing.push(`${name}: ${path}`);
                    }
                }
            }
        }
        expect(missing).toEqual([]);
    });

    /** Every command a template tells a reader to run is a declared bin. */
    test("every bin a template names is declared", async () => {
        const manifest = await Bun.file(`${repoRoot}/package.json`).json();
        const declared = new Set<string>(Object.keys(manifest.bin));
        const unknown: string[] = [];
        for (const name of [ ...MARKDOWN, ...PROFILES ]) {
            const source = await read(`${TEMPLATES}/${name}`);
            for (const match of source.matchAll(/bunx\s+([a-z][a-z0-9-]*)/g)) {
                const bin = match[1] ?? "";
                if (!declared.has(bin)) {
                    unknown.push(`${name}: ${bin}`);
                }
            }
        }
        expect(unknown).toEqual([]);
    });
});

/**
 * The remedy on a missing profile is the one place this package tells a
 * repository where the template is, and it is read by someone who has nothing
 * else to go on.
 */
describe("the missing-profile remedy", () => {
    test("names a template that ships", async () => {
        expect(TEMPLATE_PATH.startsWith(PACKAGE_PREFIX)).toBe(true);
        const path = TEMPLATE_PATH.slice(PACKAGE_PREFIX.length);
        expect(await Bun.file(`${repoRoot}/${path}`).exists()).toBe(true);
    });

    test("the diagnostic carries it", async () => {
        const directory = await mkdtemp(join(tmpdir(), "templates-"));
        try {
            const result = await loadProfiles(directory);
            const [ diagnostic ] = result.diagnostics;
            expect(diagnostic?.rule).toBe("profile.missing");
            expect(diagnostic?.remedy).toContain(TEMPLATE_PATH);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

/**
 * The whole point of a template, run.
 *
 * Everything above checks a template against the rules one at a time. This
 * checks the promise the set makes together: a repository that copies them
 * the way their own instructions say, and writes nothing else, gets a clean
 * run. Without it the templates were verified against the parser and shipped
 * an error on their first use, because the profile named an in-repo tracker
 * that no template created.
 */
describe("a repository that copies the templates", () => {
    /** The pasted half of `AGENTS-block.md`: what is inside the fence. */
    function pastedBlock(source: string): string {
        const lines = source.split("\n");
        const open = lines.indexOf("````markdown");
        const close = lines.indexOf("````", open + 1);
        expect(open).toBeGreaterThan(-1);
        expect(close).toBeGreaterThan(open);
        return `${lines.slice(open + 1, close).join("\n")}\n`;
    }

    async function scratch(): Promise<string> {
        const directory = await mkdtemp(join(tmpdir(), "adopt-"));
        await Bun.spawn([ "git", "init", "-q" ], { cwd: directory }).exited;
        const write = async (path: string, content: string) => {
            const full = join(directory, path);
            await mkdir(dirname(full), { recursive: true });
            await writeFile(full, content);
        };
        // Each destination is the one the template's own header names.
        await write(
            "project-profile.yaml",
            await read(`${TEMPLATES}/project-profile.template.yaml`),
        );
        await write(
            "docs/house-rules.md",
            await read(`${TEMPLATES}/house-rules.md`),
        );
        await write(
            "docs/wiki/wiki-principles.md",
            await read(`${TEMPLATES}/wiki-principles.md`),
        );
        await write("docs/tasks.md", await read(`${TEMPLATES}/tasks.md`));
        await write(
            "AGENTS.md",
            pastedBlock(await read(`${TEMPLATES}/AGENTS-block.md`)),
        );
        // The one file the templates assume rather than ship: a repository
        // with no README is not a shape worth checking against.
        await write("README.md", "# Scratch\n\nA repository.\n");
        return directory;
    }

    test("gets a clean run out of the umbrella", async () => {
        const directory = await scratch();
        const lines: string[] = [];
        const io = {
            out: (line: string) => lines.push(line),
            err: (line: string) => lines.push(line),
        };
        try {
            const code = await projectValidate([ "--repo", directory ], io);
            // The count rather than the exit code alone: a run that reports
            // nothing and a run whose rules did not fire both exit 0.
            expect(lines.join("\n")).toContain("0 errors");
            expect(lines.join("\n")).toContain("4 documents under docs");
            expect(code).toBe(EXIT.ok);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
