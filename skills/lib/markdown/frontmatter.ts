/**
 * Splitting a markdown file into YAML frontmatter and body.
 *
 * Shared because two unrelated things need it: a wiki page carries its graph
 * edges in frontmatter, and a lifecycle document carries its type, status and
 * freeze hash there. The rules for the two have nothing in common; where the
 * block ends and how to find the line a key sits on do.
 *
 * Parsing never throws and never rejects. These files come from repositories
 * whose authors did not write the rule, so a file with no block, or with YAML
 * that does not parse, comes back with an empty mapping and is reported by
 * whichever rule cares. A validator that crashes on the file it was pointed at
 * tells the reader nothing.
 */

/**
 * The block, with its content optional.
 *
 * Optional because `---` on the line straight after `---` is an empty block
 * and not the absence of one. Requiring a line between the delimiters made
 * that file report as having no frontmatter at all, which is a sentence about
 * a file the author is not looking at: theirs visibly opens with the two
 * delimiters.
 *
 * The optional group is greedy while its contents stay lazy, so it is tried
 * before it is skipped and every file that matched before matches the same
 * way. Only the one case where no content line can satisfy it at all is read
 * differently, which is the case being fixed. That matters more than it
 * looks: `docs-freeze` splices a key into this block and saves the file, so a
 * split that moved would rewrite documents around the wrong delimiter.
 */
const FRONTMATTER_RE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface Frontmatter {
    /** The parsed mapping. Empty when there is no block or it is malformed. */
    values: Record<string, unknown>;
    /**
     * The raw YAML between the delimiters, empty when there is no block.
     *
     * Returned rather than left to the caller to reslice, because a caller
     * measuring it against a limit has to slice the same source this function
     * normalised: a byte-order mark ahead of the delimiter shifts the block by
     * a character, and being one out at 1024 is being one out exactly where
     * the loader begins truncating.
     */
    block: string;
    /** Everything after the closing delimiter. */
    body: string;
    /** 1-based line the body starts on, so body diagnostics carry a line. */
    bodyStartLine: number;
    /** 1-based line of each top-level key that was found. */
    lines: Record<string, number>;
    /** Whether a delimited block was present at all. */
    present: boolean;
    /**
     * The block held something and it did not parse into a mapping.
     *
     * Told apart from an absent block and from an empty one because the
     * three need different sentences. Every key of a block that did not
     * parse is missing, so a rule reading the keys reports each of them as
     * absent while it sits visibly on the page, and the author goes hunting
     * for a key that is right there. Measured in three places in this
     * repository before it was pulled out here.
     *
     * A block parsing to null is not malformed: an empty document and one
     * holding only comments are both valid YAML that carry no keys, and
     * "missing" is the true thing to say about them.
     */
    malformed: boolean;
}

/** Split a raw markdown file into its frontmatter and its body. */
export function parseFrontmatter(raw: string): Frontmatter {
    // A byte-order mark before the opening delimiter would leave the block
    // unrecognised, and the file would be reported as missing every field it
    // visibly has.
    const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const match = FRONTMATTER_RE.exec(source);

    if (!match) {
        return {
            values: {},
            block: "",
            body: source,
            bodyStartLine: 1,
            lines: {},
            present: false,
            malformed: false,
        };
    }

    const block = match[1] ?? "";
    let parsed: unknown;
    try {
        parsed = Bun.YAML.parse(block);
    }
    catch {
        parsed = undefined;
    }
    const isMapping = typeof parsed === "object" && parsed !== null
        && !Array.isArray(parsed);
    const values = isMapping ? parsed as Record<string, unknown> : {};

    return {
        values,
        block,
        body: source.slice(match[0].length),
        // The block opens on line 1, so the body starts one line past the
        // closing delimiter.
        bodyStartLine: countLines(match[0]) + 1,
        malformed: block.trim() !== "" && !isMapping && parsed !== null,
        lines: keyLines(block),
        present: true,
    };
}

/**
 * Top-level keys the block declares more than once, with the line of the
 * second one.
 *
 * Read off the raw text because the parsed mapping cannot show it: YAML keeps
 * the last of two and drops the first without a word, so the file says one
 * thing to a reader scanning from the top and another to everything that
 * walks it.
 */
export function duplicateKeys(
    block: string,
): { key: string; line: number; }[] {
    const seen = new Set<string>();
    const found: { key: string; line: number; }[] = [];
    block.split("\n").forEach((line, index) => {
        const key = topLevelKey(line);
        if (key === undefined) {
            return;
        }
        if (seen.has(key)) {
            // +2: the block excludes the opening `---`, which is line 1.
            found.push({ key, line: index + 2 });
        }
        seen.add(key);
    });
    return found;
}

function countLines(text: string): number {
    return text.split("\n").length - 1;
}

/** 1-based line of each top-level key in a frontmatter block. */
function keyLines(block: string): Record<string, number> {
    const lines: Record<string, number> = {};
    block.split("\n").forEach((line, index) => {
        const key = topLevelKey(line);
        if (key !== undefined && lines[key] === undefined) {
            // +2: the block excludes the opening `---`, which is line 1.
            lines[key] = index + 2;
        }
    });
    return lines;
}

/**
 * The key a line declares, if it declares one at the top level.
 *
 * Quoted and bare spellings are the same key to YAML, so they are the same key
 * here. Reading only the bare form lets `"title":` and `title:` sit in one
 * block as a duplicate that nothing reports and the parser silently resolves.
 */
function topLevelKey(line: string): string | undefined {
    const match = /^(?:([A-Za-z0-9_-]+)|"([^"]+)"|'([^']+)')\s*:/.exec(line);
    return match === null
        ? undefined
        : match[1] ?? match[2] ?? match[3];
}
