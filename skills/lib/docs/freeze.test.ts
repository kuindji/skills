import { describe, expect, test } from "bun:test";
import { bodyHash, normaliseBody } from "./freeze";

const BODY = "# A decision\n\nWhat was decided, and why.\n";

/**
 * The hash exists to separate a rewrite from the routine. Everything a rebase,
 * a formatter or a frontmatter migration does has to leave it alone; a change
 * to the prose has to move it.
 */
describe("what does not change the hash", () => {
    const same = (variant: string) =>
        expect(bodyHash(variant)).toBe(bodyHash(BODY));

    test("line endings", () => {
        same("# A decision\r\n\r\nWhat was decided, and why.\r\n");
    });

    test("trailing whitespace on a line", () => {
        same("# A decision   \n\nWhat was decided, and why.  \n");
    });

    test("trailing blank lines", () => {
        same("# A decision\n\nWhat was decided, and why.\n\n\n");
    });

    test("a leading blank line", () => {
        same("\n# A decision\n\nWhat was decided, and why.\n");
    });

    test("tabs used as trailing whitespace", () => {
        same("# A decision\t\n\nWhat was decided, and why.\n");
    });
});

describe("what does change it", () => {
    const differs = (variant: string) =>
        expect(bodyHash(variant)).not.toBe(bodyHash(BODY));

    test("reflowing a paragraph, which is an edit to the prose", () => {
        differs("# A decision\n\nWhat was decided,\nand why.\n");
    });

    test("changing a word", () => {
        differs("# A decision\n\nWhat was decided, and how.\n");
    });

    test("removing a blank line between paragraphs", () => {
        differs("# A decision\nWhat was decided, and why.\n");
    });

    // Indentation is content in markdown: it makes a code block. Trimming the
    // whole body rather than its blank lines made these two hash alike.
    test("leading whitespace on a line", () => {
        differs("# A decision\n\n    What was decided, and why.\n");
    });

    test("leading whitespace on the first line", () => {
        differs("    # A decision\n\nWhat was decided, and why.\n");
    });
});

test("the hash is 64 hex characters", () => {
    expect(bodyHash(BODY)).toMatch(/^[0-9a-f]{64}$/);
});

test("normalisation is idempotent", () => {
    const once = normaliseBody("# T  \r\n\r\nBody.\r\n\n");
    expect(normaliseBody(once)).toBe(once);
});
