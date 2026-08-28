import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "./frontmatter";

/**
 * The three states a block can be in, and why they are three rather than two.
 *
 * A rule reading the keys has to say a different sentence about each: there
 * is no block, the block is there and carries nothing, or the block is there
 * and could not be read. Collapsing any pair of them produces a diagnostic
 * about a file that does not match what the author is looking at.
 */
describe("absent, empty and malformed are three different answers", () => {
    test("a block closed on the line after it opens is present, not absent", () => {
        const found = parseFrontmatter("---\n---\nBody\n");
        expect(found.present).toBe(true);
        expect(found.malformed).toBe(false);
        expect(found.values).toEqual({});
        expect(found.body).toBe("Body\n");
    });

    test("a block holding only whitespace is present and carries nothing", () => {
        const found = parseFrontmatter("---\n   \n---\nBody\n");
        expect(found.present).toBe(true);
        expect(found.malformed).toBe(false);
    });

    /** Valid YAML that carries no keys. Calling it broken is the wrong sentence. */
    test("a block holding only comments is present and carries nothing", () => {
        const found = parseFrontmatter("---\n# a note\n---\nBody\n");
        expect(found.present).toBe(true);
        expect(found.malformed).toBe(false);
    });

    test("a file with no block at all is absent", () => {
        const found = parseFrontmatter("# A decision\n\nBody.\n");
        expect(found.present).toBe(false);
        expect(found.malformed).toBe(false);
    });

    /**
     * Valid YAML, but not a mapping, so it holds no keys either. Reported as
     * unreadable rather than as a set of absent keys, which is the same
     * answer a block that throws gets.
     */
    test("a block that is a list or a scalar is malformed", () => {
        expect(parseFrontmatter("---\n- a\n- b\n---\nBody\n").malformed)
            .toBe(true);
        expect(parseFrontmatter("---\njust text\n---\nBody\n").malformed)
            .toBe(true);
    });

    test("a block that does not parse at all is malformed", () => {
        const found = parseFrontmatter("---\ntitle: a: b\n---\nBody\n");
        expect(found.present).toBe(true);
        expect(found.malformed).toBe(true);
    });

    test("the body still starts after the closing delimiter", () => {
        const found = parseFrontmatter("---\ntype: spec\n---\nBody\n");
        expect(found.values).toEqual({ type: "spec" });
        expect(found.body).toBe("Body\n");
        expect(found.bodyStartLine).toBe(4);
    });
});

/**
 * The block is spliced and saved by `docs-freeze`, so where it ends is not a
 * cosmetic question: a split that moved by one delimiter would rewrite real
 * documents around the wrong one. These pin the end of the block for the
 * shapes where more than one `---` is in play.
 */
describe("where the block ends", () => {
    test("a body that opens with a rule is body, not a second block", () => {
        const found = parseFrontmatter(
            "---\ntype: spec\n---\n---\n\nBody.\n",
        );
        expect(found.values).toEqual({ type: "spec" });
        expect(found.body).toBe("---\n\nBody.\n");
    });

    /**
     * The content group is tried before it is skipped, so a `---` inside the
     * block is content and the closing delimiter is still the last one. Only
     * a file with no content line at all is read the other way.
     */
    test("a leading rule inside the block does not close it early", () => {
        const found = parseFrontmatter(
            "---\n---\ntype: spec\n---\nBody\n",
        );
        expect(found.body).toBe("Body\n");
        expect(found.values).toEqual({ type: "spec" });
    });

    test("trailing spaces after the closing delimiter still close it", () => {
        const found = parseFrontmatter("---\ntype: spec\n---   \nBody\n");
        expect(found.values).toEqual({ type: "spec" });
        expect(found.body).toBe("Body\n");
    });

    test("CRLF is delimited the same way", () => {
        const found = parseFrontmatter("---\r\ntype: spec\r\n---\r\nBody\r\n");
        expect(found.values).toEqual({ type: "spec" });
        expect(found.body).toBe("Body\r\n");
    });

    test("a byte-order mark does not hide the block", () => {
        const found = parseFrontmatter("\uFEFF---\ntype: spec\n---\nBody\n");
        expect(found.present).toBe(true);
        expect(found.values).toEqual({ type: "spec" });
    });
});
