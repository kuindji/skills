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

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface Frontmatter {
    /** The parsed mapping. Empty when there is no block or it is malformed. */
    values: Record<string, unknown>;
    /** Everything after the closing delimiter. */
    body: string;
    /** 1-based line the body starts on, so body diagnostics carry a line. */
    bodyStartLine: number;
    /** 1-based line of each top-level key that was found. */
    lines: Record<string, number>;
    /** Whether a delimited block was present at all. */
    present: boolean;
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
            body: source,
            bodyStartLine: 1,
            lines: {},
            present: false,
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
    const values =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};

    return {
        values,
        body: source.slice(match[0].length),
        // The block opens on line 1, so the body starts one line past the
        // closing delimiter.
        bodyStartLine: countLines(match[0]) + 1,
        lines: keyLines(block),
        present: true,
    };
}

function countLines(text: string): number {
    return text.split("\n").length - 1;
}

/** 1-based line of each top-level key in a frontmatter block. */
function keyLines(block: string): Record<string, number> {
    const lines: Record<string, number> = {};
    block.split("\n").forEach((line, index) => {
        const match = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
        const key = match?.[1];
        if (key !== undefined && lines[key] === undefined) {
            // +2: the block excludes the opening `---`, which is line 1.
            lines[key] = index + 2;
        }
    });
    return lines;
}
