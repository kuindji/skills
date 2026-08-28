import { describe, expect, test } from "bun:test";
import { checkSkill, checkSkillLinks, parseSkill } from "./contract";

const BINS = [
    "project-validate",
    "profile-validate",
    "wiki-validate",
    "docs-validate",
    "docs-freeze",
    "guard-generated",
];

function skill(source: string, path = "skills/wiki-authoring/SKILL.md") {
    return parseSkill(source, path);
}

const GOOD = `---
name: wiki-authoring
description: Use when creating or editing a wiki page.
---

Body. Run \`wiki-validate\` and read [doctrine](../doctrine.md#the-spine).
`;

function rules(diagnostics: { rule: string; }[]): string[] {
    return diagnostics.map((d) => d.rule);
}

describe("frontmatter", () => {
    test("a well-formed skill reports nothing", () => {
        const found = checkSkill(skill(GOOD), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(found).toEqual([]);
    });

    test("a missing block is reported once, not as four missing keys", () => {
        const found = checkSkill(skill("# Wiki authoring\n\nBody.\n"), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("no frontmatter");
    });

    test("a name that is not the directory name is an error", () => {
        const source = GOOD.replace("name: wiki-authoring", "name: wiki");
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("wiki-authoring");
    });

    test("an empty description is an error", () => {
        const source = GOOD.replace(
            "description: Use when creating or editing a wiki page.",
            'description: ""',
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
    });

    test("a description over 1024 characters is an error", () => {
        const source = GOOD.replace(
            "Use when creating or editing a wiki page.",
            "Use when ".repeat(200),
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.descriptionSize" ]);
    });

    /**
     * The limit is on the description, not on the block. Measured against the
     * 395 SKILL.md files installed on this machine, reading it as the block
     * fails 43 of them, including shipped skills whose descriptions are 836,
     * 908 and 1013 characters inside blocks of 1453, 1234 and 1352.
     */
    test("other keys do not count against the description limit", () => {
        const source = GOOD.replace(
            "description: Use when creating or editing a wiki page.",
            "description: Use when editing a wiki page.\nmetadata:\n  note: "
                + `"${"x".repeat(1100)}"`,
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(found).toEqual([]);
    });

    /**
     * An unquoted value carrying a colon is not valid YAML, and it is the
     * shape a description takes by default: it happens in a real, working
     * skill installed on this machine. Reported as itself rather than as two
     * keys that are visibly on the page.
     */
    test("a block that is not valid YAML says so", () => {
        const source = GOOD.replace(
            "description: Use when creating or editing a wiki page.",
            "description: Use when editing: a wiki page.",
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("did not parse");
        expect(found[0]?.remedy).toContain("quote");
    });

    /**
     * A duplicated key parses last-wins and silently, so the file says one
     * thing to a reader and another to the loader.
     */
    test("a duplicated key is an error", () => {
        const source = GOOD.replace(
            "name: wiki-authoring",
            "name: wiki-authoring\nname: wiki-authoring",
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("twice");
    });

    test("a quoted spelling is the same key", () => {
        const source = GOOD.replace(
            "name: wiki-authoring",
            '"name": wiki-authoring\nname: wiki-authoring',
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("twice");
    });

    test("a byte-order mark does not hide the block", () => {
        const found = checkSkill(skill(`\uFEFF${GOOD}`), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(found).toEqual([]);
    });

    test("a description that is not a string says what it found", () => {
        const source = GOOD.replace(
            "description: Use when creating or editing a wiki page.",
            "description: [a, b]",
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.frontmatterShape" ]);
        expect(found[0]?.message).toContain("a,b");
    });
});

describe("the directory holds SKILL.md and nothing else", () => {
    test("a script beside the skill is an error", () => {
        const found = checkSkill(skill(GOOD), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md", "check.ts" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.directoryContents" ]);
        expect(found[0]?.message).toContain("check.ts");
        expect(found[0]?.remedy).toContain("bin");
    });
});

describe("commands the skill tells an agent to run", () => {
    test("a bin that is not declared is an error", () => {
        const source = GOOD.replace("`wiki-validate`", "`wiki-lint-validate`");
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.unknownBin" ]);
        expect(found[0]?.message).toContain("wiki-lint-validate");
    });

    /**
     * The fenced block is where an agent copies a command from, so a rule
     * that reads only inline spans is blind to the one place the command it
     * is checking actually gets run.
     */
    test("a bin inside a fenced block is checked too", () => {
        const source = GOOD.replace(
            "`wiki-validate`",
            "\n\n```\nbunx wiki-lint-validate\n```\n",
        );
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(rules(found)).toEqual([ "skill.unknownBin" ]);
    });

    /**
     * The rule reads backticked tokens only. Prose about validating a wiki is
     * not a command, and a rule that fired on it would be switched off.
     */
    test("the same words in prose are not a command", () => {
        const source = GOOD.replace("`wiki-validate`", "wiki lint validate");
        const found = checkSkill(skill(source), {
            directory: "wiki-authoring",
            entries: [ "SKILL.md" ],
            bins: BINS,
        });
        expect(found).toEqual([]);
    });
});

describe("links out of a skill", () => {
    const doctrine =
        "# Doctrine\n\n## The spine\n\n### The lifecycle contract\n";

    async function check(source: string, files: Record<string, string>) {
        return checkSkillLinks(
            skill(source),
            async (path) => files[path],
        );
    }

    test("a link to a heading that exists resolves", async () => {
        const found = await check(GOOD, { "skills/doctrine.md": doctrine });
        expect(found).toEqual([]);
    });

    test("a missing file is an error", async () => {
        const found = await check(GOOD, {});
        expect(rules(found)).toEqual([ "skill.deadLink" ]);
        expect(found[0]?.message).toContain("skills/doctrine.md");
    });

    test("a heading that does not exist is an error", async () => {
        const source = GOOD.replace("#the-spine", "#the-spinal-column");
        const found = await check(source, { "skills/doctrine.md": doctrine });
        expect(rules(found)).toEqual([ "skill.deadLink" ]);
        expect(found[0]?.message).toContain("the-spinal-column");
    });

    test("a heading below the top level resolves too", async () => {
        const source = GOOD.replace("#the-spine", "#the-lifecycle-contract");
        const found = await check(source, { "skills/doctrine.md": doctrine });
        expect(found).toEqual([]);
    });

    /**
     * A reference definition is the same link written elsewhere in the file.
     * Reading only the inline form leaves the other half of Markdown's link
     * syntax unchecked.
     */
    test("a reference-style definition is checked", async () => {
        const source = GOOD.replace(
            "[doctrine](../doctrine.md#the-spine)",
            "[doctrine][d]\n\n[d]: ../doctrine.md#the-spinal-column",
        );
        const found = await check(source, { "skills/doctrine.md": doctrine });
        expect(rules(found)).toEqual([ "skill.deadLink" ]);
    });

    /**
     * `[x: string]: any` is a TypeScript index signature, and it is the shape
     * that broke this rule when it was first written: across the SKILL.md
     * files on this machine it accounts for most of what a loose reference
     * definition reports. A real definition's label carries no whitespace.
     */
    test("a TypeScript index signature is not a link definition", async () => {
        const source = GOOD.replace(
            "Body.",
            "interface X {\n[x: string]: any\n}",
        );
        const found = await check(source, { "skills/doctrine.md": doctrine });
        expect(found).toEqual([]);
    });

    test("an anchor into the skill's own body is checked", async () => {
        const source = GOOD.replace(
            "[doctrine](../doctrine.md#the-spine)",
            "[below](#the-page)",
        );
        const found = await check(source, {});
        expect(rules(found)).toEqual([ "skill.deadLink" ]);

        const ok = GOOD.replace(
            "[doctrine](../doctrine.md#the-spine)",
            "[below](#the-page)\n\n## The page",
        );
        expect(await check(ok, {})).toEqual([]);
    });

    /**
     * Enough `..` walks out of the package, and popping an empty stack lands
     * the link back inside it: `../../../README.md` from a skill directory
     * would otherwise resolve against the repo's own README and pass.
     */
    test("a link climbing past the repo root does not alias back in", async () => {
        const source = GOOD.replace(
            "../doctrine.md#the-spine",
            "../../../README.md",
        );
        const found = await check(source, { "README.md": "# Readme" });
        expect(rules(found)).toEqual([ "skill.deadLink" ]);
    });

    /**
     * An absolute URL is somebody else's document. Fetching it to check a
     * fragment would make a validator that needs the network to answer.
     */
    test("an http link is left alone", async () => {
        const source = GOOD.replace(
            "[doctrine](../doctrine.md#the-spine)",
            "[spec](https://example.invalid/x.md#nope)",
        );
        const found = await check(source, {});
        expect(found).toEqual([]);
    });
});
