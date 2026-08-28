import { bodyLines, type MarkdownBody } from "../wiki/page";
import { CODE_EXTENSIONS } from "../wiki/prose";

/**
 * Taking the names off a page, so the sweep can grep for where they live now.
 *
 * This is the half of the drift worklist that the position bans exist to make
 * possible. A page written in names can be traced: every name greps to
 * wherever the code holding it sits today, and the dates on those files answer
 * whether the page has been overtaken. A page written in line numbers cannot
 * be traced at all, which is the second argument for the rule and the one
 * people miss.
 *
 * The extraction is a heuristic and it is advisory, which is the whole of its
 * claim. It **orders review; it does not claim coverage.** It works well for a
 * page whose subject has a unique greppable name and badly for one whose
 * subject is a convention, a legal position, or a flow spread across many
 * files. Those pages come back with nothing extracted, and the sweep surfaces
 * them on age instead rather than reporting them as clean.
 *
 * There is no frontmatter escape hatch. The design document offered pages a
 * `watch_paths` key, and it is not built, for two reasons that agree. The
 * frontmatter contract is closed at five keys, so a sixth is an error by a
 * rule that predates this one. And a list of paths is a list of positions,
 * which this system bans in prose precisely because a stale one points
 * nowhere: blessing them in frontmatter, where only the sweep would ever read
 * them, would put the decay back in the one place no reader passes. A page
 * that needs to pin a file can cite it in its body, where a reader sees it,
 * and the extraction below picks it up as a path.
 */

/**
 * How many names a page contributes.
 *
 * A page naming five hundred things is not five hundred times as worth
 * tracing, and an unbounded take turns one long page into most of the sweep's
 * running time.
 */
export const MAX_NAMES_PER_PAGE = 60;

/** The shortest token worth grepping for. Below this it matches everything. */
const MIN_NAME_CHARS = 3;

export type NameKind = "path" | "symbol";

export interface ExtractedName {
    /** The token to look for, as it would be written in code. */
    name: string;
    kind: NameKind;
    /** 1-based line in the file, so a worklist entry can cite it. */
    line: number;
}

/** Inline code spans, which is where a page writes the names it is about. */
const CODE_SPAN_RE = /`+([^`]+)`+/g;

/** A whole token that is a file path: `skills/lib/wiki/graph.ts`. */
const PATH_RE = new RegExp(
    String.raw`^(?:[\w@.-]+\/)*[\w@.-]+\.(?:${CODE_EXTENSIONS})$`,
);

/**
 * A whole token shaped like something a codebase would contain.
 *
 * Dots, dashes and underscores are in because table names, package names and
 * path aliases all use them. Anything else, a brace, an angle bracket, a hash,
 * is punctuation from the sentence around the span rather than part of a name.
 */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$.-]*$/;

/** A trailing line reference, which the position ban already reports. */
const LINE_REF_RE = /:\d+(?:\s*[-–]\s*\d+)?$/;

/** Call syntax, and any other trailing argument list. */
const CALL_RE = /\([^)]*\)$/;

/**
 * Words that appear in backticks constantly and name nothing.
 *
 * Deliberately tiny. A long stoplist becomes a second vocabulary to maintain,
 * and the file-count ceiling in the worklist already discards a token that
 * turns out to be everywhere.
 */
const LITERALS = new Set([
    "true",
    "false",
    "null",
    "nil",
    "undefined",
    "void",
    "any",
    "string",
    "number",
    "boolean",
    "object",
]);

/**
 * The names a page carries, deduplicated, in the order they first appear.
 *
 * Fenced blocks contribute nothing: a fence shows the shape of a contract, and
 * its tokens are a rendering of that shape rather than names the page is
 * about. A page showing one YAML example would otherwise watch every file in
 * the repository that mentions `title`.
 */
export function extractNames(page: MarkdownBody): ExtractedName[] {
    const found: ExtractedName[] = [];
    const seen = new Set<string>();

    for (const { line, text } of bodyLines(page)) {
        for (const match of text.matchAll(CODE_SPAN_RE)) {
            const name = normalise(match[1] ?? "");
            if (name === undefined || seen.has(name)) {
                continue;
            }
            seen.add(name);
            found.push({
                name,
                kind: PATH_RE.test(name) ? "path" : "symbol",
                line,
            });
            if (found.length === MAX_NAMES_PER_PAGE) {
                return found;
            }
        }
    }
    return found;
}

/** A span's content as a name, or undefined if it is not one. */
function normalise(span: string): string | undefined {
    const trimmed = span.trim();
    // A span holding whitespace is a command, an expression or a phrase. Each
    // of them greps as its parts, and its parts are not what the page named.
    if (trimmed === "" || /\s/.test(trimmed)) {
        return undefined;
    }

    const token = trimmed
        .replace(LINE_REF_RE, "")
        .replace(CALL_RE, "")
        .replace(/[.,;:]+$/, "")
        .replace(/\/+$/, "");

    if (token.length < MIN_NAME_CHARS) {
        return undefined;
    }
    // A leading digit is a duration, a date, a version or a count. None of
    // them is an interface name, and every one of them greps to noise.
    if (/^[0-9]/.test(token) || LITERALS.has(token.toLowerCase())) {
        return undefined;
    }
    if (PATH_RE.test(token) || IDENTIFIER_RE.test(token)) {
        return token;
    }
    return undefined;
}
