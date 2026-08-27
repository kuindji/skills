import { describe, expect, test } from "bun:test";
import {
    bodyLinks,
    isWikiPage,
    parseWikiPage,
    slugFor,
    wordCount,
} from "./page";

const page = (source: string) =>
    parseWikiPage(source, "services/orders", "docs/wiki/services/orders.md");

describe("frontmatter", () => {
    test("splits the block from the body", () => {
        const parsed = page(
            [
                "---",
                "title: Orders",
                "parents: [services]",
                "---",
                "",
                "The order pipeline.",
                "",
            ].join("\n"),
        );
        expect(parsed.frontmatter["title"]).toBe("Orders");
        expect(parsed.frontmatter["parents"]).toEqual([ "services" ]);
        expect(parsed.body.trim()).toBe("The order pipeline.");
    });

    test("a page with no frontmatter parses as an empty mapping", () => {
        const parsed = page("Just prose.\n");
        expect(parsed.frontmatter).toEqual({});
        expect(parsed.body).toBe("Just prose.\n");
        expect(parsed.bodyStartLine).toBe(1);
    });

    test("YAML that does not parse is reported as empty, not thrown", () => {
        const parsed = page("---\ntitle: [unclosed\n---\nBody.\n");
        expect(parsed.frontmatter).toEqual({});
    });

    test("a frontmatter scalar is not treated as a mapping", () => {
        const parsed = page("---\njust a string\n---\nBody.\n");
        expect(parsed.frontmatter).toEqual({});
    });

    test("keys carry the line they sit on", () => {
        const parsed = page(
            "---\ntitle: Orders\nparents: [services]\nchildren: []\n---\nB\n",
        );
        expect(parsed.frontmatterLines).toEqual({
            title: 2,
            parents: 3,
            children: 4,
        });
    });

    test("the body starts on the line after the closing delimiter", () => {
        const parsed = page("---\ntitle: Orders\n---\nfirst body line\n");
        expect(parsed.bodyStartLine).toBe(4);
    });

    test("a byte-order mark does not hide the block", () => {
        const parsed = page("\uFEFF---\ntitle: Orders\n---\nBody.\n");
        expect(parsed.frontmatter["title"]).toBe("Orders");
    });

    test("CRLF line endings parse the same as LF", () => {
        const parsed = page("---\r\ntitle: Orders\r\n---\r\nBody.\r\n");
        expect(parsed.frontmatter["title"]).toBe("Orders");
        expect(parsed.body.trim()).toBe("Body.");
    });
});

describe("body links", () => {
    test("finds plain and labelled wikilinks with their lines", () => {
        const parsed = page(
            "---\ntitle: T\n---\nSee [[services]].\n\nAlso [[data/orders|orders]].\n",
        );
        expect(bodyLinks(parsed)).toEqual([
            { target: "services", line: 4 },
            { target: "data/orders", line: 6 },
        ]);
    });

    test("two links on one line both resolve to that line", () => {
        const parsed = page("---\ntitle: T\n---\n[[a]] and [[b]].\n");
        expect(bodyLinks(parsed).map((l) => l.line)).toEqual([ 4, 4 ]);
    });

    test("shell syntax in a fenced block is not a link", () => {
        const parsed = page(
            [
                "---",
                "title: T",
                "---",
                "See [[services]].",
                "",
                "```bash",
                "if [[ -f config.json ]]; then bun run seed; fi",
                "```",
                "",
                'Inline, the check is `[[ -n "$VAR" ]]`.',
                "",
            ].join("\n"),
        );
        expect(bodyLinks(parsed)).toEqual([
            { target: "services", line: 4 },
        ]);
    });

    test("a fence showing a wikilink does not make it an edge", () => {
        const parsed = page(
            "---\ntitle: T\n---\n~~~\nLink like [[services]].\n~~~\n",
        );
        expect(bodyLinks(parsed)).toEqual([]);
    });

    test("links after a closed fence are found again", () => {
        const parsed = page(
            "---\ntitle: T\n---\n```\ncode\n```\n\nSee [[data]].\n",
        );
        expect(bodyLinks(parsed)).toEqual([ { target: "data", line: 8 } ]);
    });

    test("a longer run closes a fence, a shorter one does not", () => {
        const parsed = page(
            "---\ntitle: T\n---\n```\ncode\n````\n\nSee [[data]].\n",
        );
        expect(bodyLinks(parsed)).toEqual([ { target: "data", line: 8 } ]);
    });

    test("backtick runs pair by length, so a doubled span is code", () => {
        const parsed = page(
            "---\ntitle: T\n---\nThe literal ``[[a]]`` and [[b]].\n",
        );
        expect(bodyLinks(parsed)).toEqual([ { target: "b", line: 4 } ]);
    });

    test("an unpaired backtick opens nothing", () => {
        const parsed = page("---\ntitle: T\n---\nA ` tick and [[a]].\n");
        expect(bodyLinks(parsed)).toEqual([ { target: "a", line: 4 } ]);
    });

    test("an empty target is not a link", () => {
        const parsed = page("---\ntitle: T\n---\n[[]] and [[ ]].\n");
        expect(bodyLinks(parsed)).toEqual([]);
    });
});

describe("slugs and page selection", () => {
    test("a slug is the path without its extension", () => {
        expect(slugFor("services/orders.md")).toBe("services/orders");
        expect(slugFor("README.md")).toBe("README");
    });

    test("the authoring principles are not a page", () => {
        expect(isWikiPage("PRINCIPLES.md")).toBe(false);
        expect(isWikiPage("wiki-principles.md")).toBe(false);
        expect(isWikiPage("README.md")).toBe(true);
    });

    test("a principles page nested under a section is still a page", () => {
        expect(isWikiPage("business/PRINCIPLES.md")).toBe(true);
    });

    test("non-markdown files are not pages", () => {
        expect(isWikiPage("diagram.svg")).toBe(false);
    });
});

test("word count measures the body, not the frontmatter", () => {
    const parsed = page("---\ntitle: A Very Long Title Indeed\n---\none two\n");
    expect(wordCount(parsed)).toBe(2);
});
