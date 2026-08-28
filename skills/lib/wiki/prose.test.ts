import { describe, expect, test } from "bun:test";
import { parseWikiPage, type WikiPage } from "./page";
import { validateWikiProse } from "./prose";

function page(body: string): WikiPage {
    const fm = [
        "title: Services",
        "parents: [README]",
        "children: []",
        "related_pages: []",
        "last_updated: 2026-08-27",
    ].join("\n");
    return parseWikiPage(
        `---\n${fm}\n---\n${body}`,
        "services",
        "docs/wiki/services.md",
    );
}

function check(body: string, policy: "citation" | "forbidden" = "citation") {
    return validateWikiProse([ page(body) ], { pathCitations: policy });
}

const rules = (body: string, policy?: "citation" | "forbidden") =>
    check(body, policy).diagnostics.map((d) => d.rule);

describe("line numbers", () => {
    test("a single line reference is an error", () => {
        const found = check("See `src/wiki.ts:101` for the parser.\n");
        expect(found.diagnostics).toHaveLength(1);
        expect(found.diagnostics[0]!.rule).toBe("wiki.lineNumber");
        expect(found.diagnostics[0]!.line).toBe(8);
    });

    test("a range is an error", () => {
        expect(rules("See `serverless.yml:101-110`.\n")).toEqual([
            "wiki.lineNumber",
        ]);
    });

    // A list of lines is one citation. Naming only its first number leaves the
    // rest of the list behind when the remedy is applied to what was named,
    // and `awsConfig.ts,41` is not a citation any rule then catches.
    test("a list of lines is named whole", () => {
        const found = check("See `src/wiki.ts:101,140-146` for the parser.\n");
        expect(found.diagnostics).toHaveLength(1);
        expect(found.diagnostics[0]!.message).toContain(
            "`src/wiki.ts:101,140-146`",
        );
    });

    test("a sentence's own comma is not part of the citation", () => {
        const found = check("`src/wiki.ts:101`, 40 lines above the parser.\n");
        expect(found.diagnostics[0]!.message).toContain("`src/wiki.ts:101`");
        expect(found.diagnostics[0]!.message).not.toContain("40");
    });

    test("the citation is reported once, not also as a path", () => {
        expect(rules("`src/wiki.ts:101`\n", "forbidden")).toEqual([
            "wiki.lineNumber",
        ]);
    });

    test("its remedy differs by policy, because the fix does", () => {
        const allowed = check("`src/wiki.ts:101`\n").diagnostics[0]!;
        const banned = check("`src/wiki.ts:101`\n", "forbidden")
            .diagnostics[0]!;
        expect(allowed.remedy).toContain("keeping the path");
        expect(banned.remedy).toContain("Remove the citation");
    });

    test("a bare path carries no line-number error", () => {
        expect(rules("See `src/wiki.ts` for the parser.\n")).toEqual([]);
    });

    test("a time of day is not a line reference", () => {
        expect(rules("The job runs at 09:30 every day.\n")).toEqual([]);
    });
});

describe("path citations", () => {
    test("under `citation` they are counted and not reported", () => {
        const found = check("`src/wiki.ts` and `package.json`.\n");
        expect(found.diagnostics).toEqual([]);
        expect(found.pathCitations).toBe(2);
        expect(found.pagesWithPathCitations).toBe(1);
    });

    test("under `forbidden` each one is an error, and still counted", () => {
        const found = check("`src/wiki.ts` and `package.json`.\n", "forbidden");
        expect(found.diagnostics.map((d) => d.rule)).toEqual([
            "wiki.pathCitation",
            "wiki.pathCitation",
        ]);
        expect(found.pathCitations).toBe(2);
    });

    // The rule reads inline code because that is where the convention lives:
    // of 1100 path references in one real wiki, 1065 sit inside backticks.
    test("a path inside backticks is a citation", () => {
        expect(check("The parser is `src/wiki.ts`.\n").pathCitations).toBe(1);
    });

    test("a path inside a fence is part of a command, not a citation", () => {
        const body =
            "Run it:\n\n```bash\nbun cli/wiki/validate.ts --json\n```\n";
        expect(check(body).pathCitations).toBe(0);
    });

    test("a domain name is not a path", () => {
        const found = check("Hosted at github.com/kuindji/skills.\n");
        expect(found.pathCitations).toBe(0);
    });

    test("a version number is not a path", () => {
        expect(check("Pinned to bun 1.2.3 for now.\n").pathCitations).toBe(0);
    });

    // Both were found firing against the real wikis.
    test("`Node.js` and `process.env` are not paths", () => {
        const found = check("`Node.js` 22 reads `process.env.STAGE`.\n");
        expect(found.pathCitations).toBe(0);
    });

    // `bun.sh` and `migrate.sh` are the same shape; only context separates
    // them, and the convention writes a real path in backticks.
    test("a bare brand ending in a country code is a domain, not a path", () => {
        expect(
            check("Install Bun from bun.sh before running it.\n")
                .pathCitations,
        ).toBe(0);
    });

    test("the same shape inside backticks is a path", () => {
        expect(check("Run `migrate.sh` after deploying.\n").pathCitations)
            .toBe(1);
    });

    test("a match cannot end mid-domain", () => {
        expect(check("Use `pkg.go.dev` for module docs.\n").pathCitations)
            .toBe(0);
    });

    test("a path and a bare repeat of it on one line both count", () => {
        const found = check(
            "See `src/app.ts:10` and `src/app.ts`.\n",
            "forbidden",
        );
        expect(found.diagnostics.map((d) => d.rule)).toEqual([
            "wiki.lineNumber",
            "wiki.pathCitation",
        ]);
        expect(found.pathCitations).toBe(2);
    });

    test("a page with no paths is not counted as carrying one", () => {
        expect(check("Plain prose.\n").pagesWithPathCitations).toBe(0);
    });
});

describe("directory trees", () => {
    const tree = [
        "The layout:",
        "",
        "```",
        "skills/",
        "├── lib/",
        "└── bin/",
        "```",
        "",
    ].join("\n");

    // A tree inside a fence is the thing being banned, not an exception to it,
    // so this rule reads the line as written.
    test("a tree inside a fence is still a tree", () => {
        const found = check(tree);
        expect(found.diagnostics.map((d) => d.rule)).toEqual([
            "wiki.directoryTree",
        ]);
        expect(found.diagnostics[0]!.line).toBe(12);
    });

    test("a tree is one diagnostic, not one per row", () => {
        const big = "```\n" + "├── a/\n".repeat(20) + "└── z/\n```\n";
        expect(rules(big)).toEqual([ "wiki.directoryTree" ]);
    });

    test("a single connector is not a tree", () => {
        expect(rules("The glyph └── is drawn like this.\n")).toEqual([]);
    });

    test("a markdown table is not a tree", () => {
        const table = "| a | b |\n| --- | --- |\n| 1 | 2 |\n";
        expect(rules(table)).toEqual([]);
    });

    // Box-drawing also draws state machines and flows. A state is not a
    // position, and banning one would delete a diagram.
    test("a state diagram is not a directory tree", () => {
        const flow = [
            "Flow:",
            "",
            "```",
            "Authenticated",
            "├── Refresh token",
            "└── Logout",
            "```",
            "",
        ].join("\n");
        expect(rules(flow)).toEqual([]);
    });
});

describe("snapshot markers", () => {
    test("`currently` is a warning, not an error", () => {
        const found = check("The pipeline currently runs nightly.\n");
        expect(found.diagnostics).toHaveLength(1);
        expect(found.diagnostics[0]!.rule).toBe("wiki.snapshot");
        expect(found.diagnostics[0]!.severity).toBe("warning");
    });

    test("`as of` is a warning", () => {
        expect(rules("As of the last audit, four lists are covered.\n"))
            .toEqual([ "wiki.snapshot" ]);
    });

    // Every one of the four hits in one real wiki was this sense.
    test("`at the moment` introducing a clause is not a snapshot", () => {
        expect(rules("Converted at the moment the order lands.\n")).toEqual([]);
        expect(rules("Sent at the moment one of these arrives.\n")).toEqual([]);
    });

    test("`at the moment` ending a clause is a snapshot", () => {
        expect(rules("Only a short list does this at the moment.\n")).toEqual([
            "wiki.snapshot",
        ]);
    });

    test("a marker inside code is not prose", () => {
        expect(rules("The flag is `currently_active`.\n")).toEqual([]);
    });

    test("a marker inside an identifier is not a marker", () => {
        expect(rules("The CurrentlyActiveState enum owns the flag.\n"))
            .toEqual([]);
        expect(rules("A recentlySeen map holds the last hour.\n")).toEqual([]);
    });
});

describe("what is deliberately not banned", () => {
    // The wider version of this rule would have deleted contracts while
    // claiming to protect them.
    test("call syntax is a name, not a position", () => {
        expect(rules("Call `useToast()` to raise one.\n")).toEqual([]);
    });

    test("a schedule expression is a contract", () => {
        expect(rules("The rule fires on `rate(1 minute)`.\n")).toEqual([]);
    });

    test("a fenced contract shape is not a violation", () => {
        expect(rules("```ts\ntype Toast = { id: string };\n```\n")).toEqual([]);
    });

    test("a bare date is not a violation", () => {
        expect(rules("The migration landed on 2026-07-18.\n")).toEqual([]);
    });

    test("an em dash is a matter for the unslop pass", () => {
        expect(rules("The rule holds — and it is not this one.\n")).toEqual([]);
    });
});

test("counts accumulate across pages", () => {
    const found = validateWikiProse(
        [ page("`a/one.ts`\n"), page("`b/two.ts` and `b/three.ts`\n") ],
        { pathCitations: "citation" },
    );
    expect(found.pathCitations).toBe(3);
    expect(found.pagesWithPathCitations).toBe(2);
});
