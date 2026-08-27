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
    const lines = page.body.split("\n");
    let fence: string | undefined;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? "";
        const marker = fenceMarker(raw);

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
            continue;
        }
        if (marker !== undefined) {
            fence = marker;
            continue;
        }

        for (const match of maskInlineCode(raw).matchAll(WIKILINK_RE)) {
            const target = (match[1] ?? "").trim();
            if (target.length > 0) {
                links.push({ target, line: page.bodyStartLine + i });
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

/** The opening or closing run of a code fence, if this line is one. */
function fenceMarker(line: string): string | undefined {
    return /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
}

/**
 * Blank out inline code spans, keeping the line's length so nothing else
 * shifts. Backtick runs pair by length, the way Markdown pairs them.
 */
function maskInlineCode(line: string): string {
    return line.replace(
        /(`+)([^`]*?)\1/g,
        (match) => " ".repeat(match.length),
    );
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
