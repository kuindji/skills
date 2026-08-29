import type { Diagnostic, PathCitations } from "../profile/types";
import { bodyLines, type WikiPage } from "./page";

/**
 * The position bans, and the one rule whose policy a project chooses.
 *
 * A **name** is part of an interface. It is stable, greppable, and changes
 * loudly through a migration, a deploy or a released version: table names,
 * service and stack names, environment names, package names, public routes,
 * queue names, exported API names, schedule expressions. Names belong on a
 * page, and technical pages are required to carry them.
 *
 * A **position** is where something currently sits. It changes silently in any
 * edit and is not greppable once wrong: line numbers, line ranges, directory
 * trees. Positions are what these rules remove.
 *
 * The line between the two is drawn narrowly on purpose. An earlier and wider
 * formulation would have banned call syntax, fenced blocks and bare dates, and
 * measured against the real wikis it would have deleted contracts while
 * claiming to protect them: `rate(1 minute)` is an EventBridge schedule,
 * `useToast()` is the most stable name in its codebase, and 4 of 10 pages in
 * one wiki use fences to show contract shapes.
 */

/**
 * Extensions that make a token a file path rather than a domain or a version.
 *
 * A closed list, because the open version of this rule reads `github.com` and
 * `v1.2.3` as file paths. Being wrong in that direction is the expensive one:
 * a rule that fires on a legitimate sentence is how a validator gets switched
 * off, and a missed citation costs only that citation.
 */
export const CODE_EXTENSIONS = [
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "json",
    "jsonc",
    "ya?ml",
    "sql",
    "py",
    "sh",
    "bash",
    "zsh",
    "md",
    "mdx",
    "css",
    "scss",
    "less",
    "html",
    "toml",
    "ini",
    "cfg",
    "tf",
    "tfvars",
    "graphql",
    "gql",
    "swift",
    "kt",
    "kts",
    "java",
    "rb",
    "go",
    "rs",
    "php",
    "vue",
    "svelte",
    "prisma",
    "proto",
    "lock",
    "xml",
    "plist",
    "gradle",
    "podspec",
].join("|");

/**
 * Tokens that look like a path and are not one.
 *
 * `Node.js` and its siblings are product names, and `process.env` is an
 * expression; both were found firing against the real wikis. `env` is absent
 * from the extension list above for the same reason: a file actually named
 * `.env` has nothing before the dot and never matched anyway, so the
 * extension bought nothing and cost `process.env` six false positives.
 */
const NOT_A_PATH =
    /^(?:Node|Next|Nuxt|Vue|React|Express|Ember|Backbone|Alpine|Three|Chart|D3)\.js$/;

/**
 * Extensions a developer-facing domain is actually built on, so a token
 * carrying one may be a brand rather than a file. `migrate.sh` and `bun.sh`
 * are the same shape and only context separates them: the citation convention
 * writes paths in backticks, so a bare one in running prose is read as a
 * domain.
 *
 * Deliberately just these two. The wider list of country codes that collide
 * with source extensions costs far more than it saves: adding `py`, `md` and
 * `rs` took one real wiki from 51 path citations to 18, because `.py` and
 * `.md` files get named in bare prose all the time and Paraguayan domains do
 * not come up.
 */
const TLD_LIKE_RE = /\.(?:sh|go)$/;

// The trailing lookahead stops a match ending mid-domain: without it
// `pkg.go.dev` yields `pkg.go`, because `go` is a source extension as well as
// a country code.
const PATH_SOURCE = String
    .raw`(?<![\w/.-])(?:[\w@.-]+\/)*[\w@.-]+\.(?:${CODE_EXTENSIONS})\b(?!\.[A-Za-z]{2,})`;

/** `src/wiki.ts:101`, `src/wiki.ts:101-110` and `src/wiki.ts:101,140-146`. */
// A comma list is one citation and has to match whole. Matching only its first
// number names half the string in the diagnostic, and the remedy applied to
// what was named leaves `src/wiki.ts,140-146` behind, which carries no colon
// and so is not a citation any rule catches afterwards. The list items take no
// space around the comma, so a sentence reading `app.ts:12`, 40 lines later
// keeps its own comma.
const LINE_RANGE = String.raw`\d+(?:\s*[-–]\s*\d+)?`;
const LINE_REF_RE = new RegExp(
    `${PATH_SOURCE}:${LINE_RANGE}(?:,${LINE_RANGE})*`,
    "g",
);
const STANDALONE_LINE_REF_RE = new RegExp(
    String.raw`\blines?\s+${LINE_RANGE}(?:\s*,\s*${LINE_RANGE})*`,
    "gi",
);
const INLINE_LINE_SHORTHAND_RE = new RegExp(
    String.raw`(?<!\`)\`(:${LINE_RANGE}(?:,${LINE_RANGE})*)\`(?!\`)`,
    "g",
);
const PATH_RE = new RegExp(PATH_SOURCE, "g");

/**
 * The connector a rendered directory tree is drawn with.
 *
 * Matched against the line as written, fences included, because a tree inside
 * a fence is exactly the thing being banned rather than an exception to it.
 * Only the connector form is matched: an indented listing of directory names
 * is indistinguishable from a bullet list, and guessing there would fire on
 * ordinary prose.
 */
const TREE_CONNECTOR_RE = /[├└][─-]{2}\s*(\S[^\n]*?)\s*$/;

/**
 * What a tree row has to name to be a directory tree.
 *
 * One token, optionally with a trailing slash. Box-drawing is also how people
 * draw state machines and flows, and `├── Refresh token` is a state rather
 * than a position: banning it would delete a diagram while claiming to protect
 * against staleness.
 */
const TREE_ENTRY_RE = /^[\w.@$-]+\/?$/;

/**
 * Prose that states the current state as though it were a fact about the
 * system. It reads as true, goes stale within weeks, and nothing marks the
 * moment it stopped being true. A warning rather than an error, because the
 * same words are sometimes load-bearing.
 */
const SNAPSHOT_RE = new RegExp(
    "\\b(?:" + [
        "currently\\b",
        "recently\\b",
        "nowadays\\b",
        "as of\\b",
        "at present\\b",
        "right now\\b",
        // "at the moment one of these arrives" is a temporal conjunction, not
        // a snapshot, and every one of the four hits in one real wiki was that
        // sense. The snapshot reading ends the clause; the conjunction reading
        // introduces one, so the clause end is what is matched on.
        "at the moment(?=\\s*[.,;:)]|\\s*$)",
    ].join("|") + ")",
    "gi",
);

export interface ProseReport {
    diagnostics: Diagnostic[];
    /**
     * File-path references found, under either policy.
     *
     * Reported whether or not the policy allows them, so the inventory stays
     * visible in a project that has sanctioned the practice. A number nobody
     * looks at is how 193 line-number citations accumulate unnoticed.
     */
    pathCitations: number;
    /** Pages carrying at least one path reference. */
    pagesWithPathCitations: number;
}

export interface ProseRules {
    pathCitations: PathCitations;
}

/** Check every page's prose for positions. */
export function validateWikiProse(
    pages: WikiPage[],
    rules: ProseRules,
): ProseReport {
    const diagnostics: Diagnostic[] = [];
    let pathCitations = 0;
    let pagesWithPathCitations = 0;

    for (const page of pages) {
        const before = pathCitations;
        pathCitations += checkPage(page, rules, diagnostics);
        if (pathCitations > before) {
            pagesWithPathCitations++;
        }
    }

    return { diagnostics, pathCitations, pagesWithPathCitations };
}

/** Returns how many path references the page carries. */
function checkPage(
    page: WikiPage,
    rules: ProseRules,
    out: Diagnostic[],
): number {
    const forbidden = rules.pathCitations === "forbidden";
    let citations = 0;
    let treeLine: number | undefined;
    let treeLines = 0;

    for (const { line, raw, text, prose } of bodyLines(page)) {
        const connector = TREE_CONNECTOR_RE.exec(raw);
        if (connector && TREE_ENTRY_RE.test(connector[1] ?? "")) {
            treeLines++;
            treeLine ??= line;
        }

        // Spans carrying a line number are reported once, here. Reporting the
        // path inside them as well would put two diagnostics on one string
        // whose single fix removes both. Recorded as ranges rather than as
        // text: matching by string suppressed a second, bare `src/app.ts`
        // later on the same line, which is a citation in its own right.
        const lineRefSpans: [ number, number ][] = [];
        for (const match of text.matchAll(LINE_REF_RE)) {
            lineRefSpans.push([
                match.index,
                match.index + match[0].length,
            ]);
            citations++;
            out.push({
                file: page.path,
                keyPath: "",
                line,
                rule: "wiki.lineNumber",
                message: `\`${match[0]}\` cites a line number.`,
                remedy: forbidden
                    ? "Remove the citation and name the thing instead: the "
                        + "function, the table, the environment variable. A "
                        + "line number is wrong after the next edit to the "
                        + "file and cannot be grepped back to what it meant."
                    : "Drop the `:` and the digits, keeping the path. A line "
                        + "number is wrong after the next edit to the file, "
                        + "cannot be grepped back to what it meant, and says "
                        + "nothing the path did not already say.",
                severity: "error",
            });
        }

        // A named function followed by `(line 90)` is still written in a
        // position even though no file path carries the number. Match the
        // word before the number so quantities such as `40 lines later` do
        // not become citations. These do not increment `pathCitations`: the
        // report counts file paths, and this form contains none.
        for (const match of text.matchAll(STANDALONE_LINE_REF_RE)) {
            out.push({
                file: page.path,
                keyPath: "",
                line,
                rule: "wiki.lineNumber",
                message: `\`${match[0]}\` cites a line number.`,
                remedy:
                    "Remove the line reference and keep the stable name: the "
                    + "function, table, route, event, or environment variable. "
                    + "A line number is wrong after the next edit and cannot "
                    + "be grepped back to what it meant.",
                severity: "error",
            });
        }

        // A later reference sometimes abbreviates an already-named path to
        // `:233-244`. Match only a whole inline-code span. That excludes an
        // IPv6 address, a JSON value such as `"code":9001`, a time, and a
        // port without guessing what the surrounding sentence means.
        for (const match of text.matchAll(INLINE_LINE_SHORTHAND_RE)) {
            const shorthand = match[1] ?? match[0];
            out.push({
                file: page.path,
                keyPath: "",
                line,
                rule: "wiki.lineNumber",
                message: `\`${shorthand}\` cites a line number.`,
                remedy:
                    "Remove the shorthand and keep the stable name it refers "
                    + "to. A line number is wrong after the next edit and "
                    + "cannot be grepped back to what it meant.",
                severity: "error",
            });
        }

        for (const match of text.matchAll(PATH_RE)) {
            const path = match[0];
            if (NOT_A_PATH.test(path)) {
                continue;
            }
            // The path half of a line reference already has its diagnostic.
            const start = match.index;
            if (
                lineRefSpans.some(([ from, to ]) => start >= from && start < to)
            ) {
                continue;
            }
            // A brand ending in a country-code extension is a domain, not a
            // file: `bun.sh` and `pkg.go.dev` both read as paths otherwise.
            // The citation convention writes paths in backticks, so for these
            // extensions that is what separates `migrate.sh` from `bun.sh`.
            if (
                TLD_LIKE_RE.test(path) && !path.includes("/")
                && prose.slice(start, start + path.length).trim() !== ""
            ) {
                continue;
            }
            citations++;
            if (!forbidden) {
                continue;
            }
            out.push({
                file: page.path,
                keyPath: "",
                line,
                rule: "wiki.pathCitation",
                message: `\`${path}\` cites a file path.`,
                remedy:
                    "This project bans path citations in wiki prose. Name what "
                    + "lives there instead: a file moves silently and takes the "
                    + "sentence with it, while the name it exports survives the "
                    + "move and can be grepped.",
                severity: "error",
            });
        }

        for (const match of prose.matchAll(SNAPSHOT_RE)) {
            out.push({
                file: page.path,
                keyPath: "",
                line,
                rule: "wiki.snapshot",
                message: `\`${match[0]}\` states the current state as a fact.`,
                remedy:
                    "Describe the mechanism, and say where the current state "
                    + "can be looked up. Nothing marks the moment this sentence "
                    + "stops being true, so a reader a year from now has no way "
                    + "to tell it has.",
                severity: "warning",
            });
        }
    }

    // A tree is one violation rather than one per row, and two connectors are
    // what separates a rendered tree from a stray character.
    if (treeLines >= 2 && treeLine !== undefined) {
        out.push({
            file: page.path,
            keyPath: "",
            line: treeLine,
            rule: "wiki.directoryTree",
            message: `The page renders a directory tree, over ${treeLines} `
                + "lines.",
            remedy:
                "Say what lives where in a sentence per subtree, naming the "
                + "subtrees. The tree is a picture of one moment's layout: it "
                + "is stale after any move, and it says nothing about what the "
                + "directories are for, which is the part a reader came for.",
            severity: "error",
        });
    }

    return citations;
}
