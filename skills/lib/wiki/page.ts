/**
 * Reading a wiki page into the pieces the rules operate on.
 *
 * A page is plain markdown with a small YAML frontmatter block carrying the
 * graph edges. The graph lives in frontmatter rather than in prose because a
 * relation stated only in a sentence cannot be walked, checked for symmetry,
 * or repaired when a page moves.
 *
 * Parsing never throws and never rejects. A page with no frontmatter, or with
 * YAML that does not parse, comes back with an empty mapping so the rules
 * report it as a frontmatter problem. A validator that crashes on the file it
 * was pointed at tells the reader nothing.
 */

/** Matches `[[slug]]` and `[[slug|label]]`; capture group 1 is the slug. */
export const WIKILINK_RE = /\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The five keys a page may carry. Anything else is a violation. */
export const FRONTMATTER_KEYS = [
    "title",
    "parents",
    "children",
    "related_pages",
    "last_updated",
] as const;

export interface WikiPage {
    /**
     * Wiki-root-relative path without `.md`, e.g. `services/orders`. This is
     * the id every edge uses: frontmatter lists slugs, and `[[slug]]` in the
     * body resolves against the same namespace.
     */
    slug: string;
    /** Repo-relative path. Diagnostics point here, not at the slug. */
    path: string;
    /** Raw mapping. Unvalidated on purpose: the rules report on its shape. */
    frontmatter: Record<string, unknown>;
    /** Everything after the closing delimiter. */
    body: string;
    /** 1-based line the body starts on, so body diagnostics carry a line. */
    bodyStartLine: number;
    /** 1-based line of each top-level frontmatter key that was found. */
    frontmatterLines: Record<string, number>;
}

/** One `[[slug]]` occurrence, with the line it sits on. */
export interface WikiLink {
    target: string;
    line: number;
}

/** Split a raw page into frontmatter and body. */
export function parseWikiPage(
    raw: string,
    slug: string,
    path: string,
): WikiPage {
    // A byte-order mark before the opening delimiter would leave the block
    // unrecognised, and the page would be reported as missing every field it
    // visibly has.
    const source = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const match = FRONTMATTER_RE.exec(source);
    if (!match) {
        return {
            slug,
            path,
            frontmatter: {},
            body: source,
            bodyStartLine: 1,
            frontmatterLines: {},
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
    const frontmatter =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};

    return {
        slug,
        path,
        frontmatter,
        body: source.slice(match[0].length),
        // The block opens on line 1, so its first key is on line 2 and the
        // body starts one line past the closing delimiter.
        bodyStartLine: countLines(match[0]) + 1,
        frontmatterLines: keyLines(block),
    };
}

/** One line of a page body, split into what it is written as and what it says. */
export interface BodyLine {
    /** 1-based line number in the file. */
    line: number;
    /** The line as written, code and all. */
    raw: string;
    /**
     * The line with fenced code blanked out, inline spans kept.
     *
     * This is the view for anything measuring what a page cites, because the
     * citation convention these rules exist to measure is written in inline
     * code: of 1100 file-path references in one real wiki, 1065 sit inside
     * backticks and 5 inside fences. Masking inline code would make the rule
     * blind to almost every occurrence it was written to find.
     */
    text: string;
    /**
     * `text` with inline spans blanked out too.
     *
     * The view for anything reading the page as English. Code is masked
     * rather than dropped so a column in the masked line is a column in the
     * real one.
     */
    prose: string;
}

/**
 * The body, line by line, with code separated from prose.
 *
 * Every rule that reads a page has to decide whether code counts, and they do
 * not all answer the same way. A wikilink inside a fence is an example rather
 * than an edge. A directory tree inside a fence is exactly the thing being
 * banned. A file path inside backticks is the citation convention itself,
 * while the same path inside a fence is part of a command someone runs.
 * Splitting the views here lets each rule say which it means, instead of each
 * rule reimplementing Markdown and getting a different answer.
 */
export function bodyLines(page: WikiPage): BodyLine[] {
    const out: BodyLine[] = [];
    const lines = page.body.split("\n");
    let fence: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? "";
        const marker = fenceMarker(raw);
        let inCode = fence !== undefined;

        if (fence !== undefined) {
            // A closing fence is the same character, at least as long, and
            // carries no info string.
            if (
                marker !== undefined && marker[0] === fence[0]
                && marker.length >= fence.length
                && raw.trimEnd().endsWith(marker)
            ) {
                fence = undefined;
            }
        }
        else if (marker !== undefined) {
            fence = marker;
            inCode = true;
        }

        const text = inCode ? " ".repeat(raw.length) : raw;
        out.push({
            line: page.bodyStartLine + i,
            raw,
            text,
            prose: maskInlineCode(text),
        });
    }

    return out;
}

/**
 * Every `[[slug]]` in the body, in order, with absolute line numbers.
 *
 * Code is excluded, both fenced blocks and inline spans. Two reasons, and the
 * first is the one that matters: `[[` is shell syntax, so a page documenting
 * `if [[ -f config.json ]]` would otherwise report two links that resolve to
 * nothing, on a page whose only fault is showing a command. Technical pages are
 * required to carry real identifiers, so this is ordinary content, not an edge
 * case. The second is that a fence showing what a wikilink looks like is an
 * example of an edge rather than one, and must not make its target reachable.
 */
export function bodyLinks(page: WikiPage): WikiLink[] {
    const links: WikiLink[] = [];
    for (const { line, prose } of bodyLines(page)) {
        for (const match of prose.matchAll(WIKILINK_RE)) {
            const target = (match[1] ?? "").trim();
            if (target.length > 0) {
                links.push({ target, line });
            }
        }
    }
    return links;
}

/** Body word count, which is what the size budget is measured in. */
export function wordCount(page: WikiPage): number {
    return page.body.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * The slug a wiki file answers to.
 *
 * Separator normalisation matters: the slug is compared against frontmatter
 * written by hand, which always uses forward slashes.
 */
export function slugFor(wikiRelativePath: string): string {
    return wikiRelativePath.replace(/\.md$/, "").split(/[\\/]/).join("/");
}

/**
 * Whether a file under the wiki root is a page.
 *
 * The authoring principles live at the wiki root and are prose about the
 * wiki rather than part of it: they carry no graph edges and nothing links to
 * them, so validating them as pages would report an orphan on the one file
 * explaining what an orphan is.
 */
export function isWikiPage(wikiRelativePath: string): boolean {
    if (!wikiRelativePath.endsWith(".md")) {
        return false;
    }
    const slug = slugFor(wikiRelativePath);
    return slug !== "PRINCIPLES" && slug !== "wiki-principles";
}

/**
 * The opening or closing run of a code fence, if this line is one.
 *
 * Any indentation counts, not Markdown's three-space limit for a top-level
 * fence. A fence inside a list item is indented to the list's content column,
 * commonly four spaces, and reading that as prose leaks whatever the block
 * holds: a `grep -n src/x.ts:12` in a numbered step would be reported as a
 * line-number citation. Four-space content is a Markdown indented code block
 * in its own right, so nothing legible as prose is lost either way.
 */
function fenceMarker(line: string): string | undefined {
    return /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
}

/**
 * Blank out inline code spans, keeping the line's length so nothing else
 * shifts.
 *
 * Backtick runs pair by length, the way Markdown pairs them: a span opens with
 * a run of n and closes at the next run of exactly n, and shorter runs inside
 * are content. A regex cannot express that, and the version that tried read
 * ``use `x` then [[ghost]]`` as prose and reported the wikilink inside it as a
 * broken edge. An unpaired run opens nothing and is left alone.
 */
function maskInlineCode(line: string): string {
    const out = [ ...line ];
    let i = 0;

    while (i < line.length) {
        if (line[i] !== "`") {
            i++;
            continue;
        }
        const open = runLength(line, i);
        const close = findRun(line, i + open, open);
        if (close === -1) {
            i += open;
            continue;
        }
        for (let k = i; k < close + open; k++) {
            out[k] = " ";
        }
        i = close + open;
    }

    return out.join("");
}

/** How many backticks start at `from`. */
function runLength(line: string, from: number): number {
    let n = 0;
    while (line[from + n] === "`") {
        n++;
    }
    return n;
}

/** Index of the next run of exactly `length` backticks, or -1. */
function findRun(line: string, from: number, length: number): number {
    let i = from;
    while (i < line.length) {
        if (line[i] !== "`") {
            i++;
            continue;
        }
        const run = runLength(line, i);
        if (run === length) {
            return i;
        }
        i += run;
    }
    return -1;
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
