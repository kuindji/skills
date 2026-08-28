import { describe, expect, test } from "bun:test";
import { listRepoFiles } from "../docs/git";
import { checkSkill, checkSkillLinks, parseSkill } from "./contract";

/**
 * Every skill this repo ships, held to the contract.
 *
 * The walking is here rather than in a module of its own because there is one
 * caller and it is this file. Consuming repositories have no `skills/`
 * directory, so nothing about this check travels with the package.
 */

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
);

async function bins(): Promise<string[]> {
    const manifest = await Bun.file(`${repoRoot}/package.json`).json();
    return Object.keys(manifest.bin);
}

interface Loaded {
    directory: string;
    entries: string[];
    source: string;
}

/**
 * Tracked files rather than a directory listing. The rule is about what the
 * package ships, and an untracked `.DS_Store` failing this check is how a
 * check gets deleted rather than how a skill gets fixed.
 */
async function loadSkills(): Promise<Loaded[]> {
    const entries = new Map<string, string[]>();
    for (const path of await listRepoFiles(repoRoot)) {
        const match = /^skills\/([^/]+)\/(.+)$/.exec(path);
        const directory = match?.[1];
        const name = match?.[2];
        if (directory === undefined || name === undefined) {
            continue;
        }
        entries.set(directory, [ ...entries.get(directory) ?? [], name ]);
    }

    const found: Loaded[] = [];
    for (const [ directory, names ] of entries) {
        if (!names.includes("SKILL.md")) {
            continue;
        }
        found.push({
            directory,
            entries: names,
            source: await Bun.file(
                `${repoRoot}/skills/${directory}/SKILL.md`,
            ).text(),
        });
    }
    return found.sort((a, b) => a.directory.localeCompare(b.directory));
}

describe("this repo's skills", () => {
    test("wiki-authoring is one of them", async () => {
        const names = (await loadSkills()).map((s) => s.directory);
        expect(names).toContain("wiki-authoring");
    });

    test("every skill satisfies the contract", async () => {
        const declared = await bins();
        const problems = [];
        for (const skill of await loadSkills()) {
            const parsed = parseSkill(
                skill.source,
                `skills/${skill.directory}/SKILL.md`,
            );
            problems.push(
                ...checkSkill(parsed, {
                    directory: skill.directory,
                    entries: skill.entries,
                    bins: declared,
                }),
            );
        }
        // The diagnostics are the finding, so they go in the message rather
        // than being reported as a bare length.
        expect(problems.map((d) => `${d.file}: ${d.message}`)).toEqual([]);
    });

    test("every link out of a skill resolves, heading and all", async () => {
        const problems = [];
        for (const skill of await loadSkills()) {
            const parsed = parseSkill(
                skill.source,
                `skills/${skill.directory}/SKILL.md`,
            );
            problems.push(
                ...await checkSkillLinks(parsed, async (path) => {
                    const file = Bun.file(`${repoRoot}/${path}`);
                    return await file.exists() ? file.text() : undefined;
                }),
            );
        }
        expect(problems.map((d) => `${d.file}: ${d.message}`)).toEqual([]);
    });
});
