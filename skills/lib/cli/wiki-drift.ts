import type { DriftEntry } from "../names/drift";
import { type DriftScan, scanDrift } from "../names/scan";
import type { Diagnostic } from "../profile/types";
import { preflight, value } from "./args";
import { loadContext } from "./context";
import { formatDiagnostics, type Io, plural } from "./report";
import { EXIT } from "./report";

/**
 * `wiki-drift`: which wiki pages to reread, in what order.
 *
 * The seventh bin, and the only one that reports rather than judges. The other
 * six answer whether a repository breaks a rule; this one answers what to look
 * at next, which is a different question with a different exit code. A queued
 * page is not a fault. The worklist is a heuristic over names and dates, and a
 * tool that failed a build over one would be asking CI to enforce a grep.
 *
 * So it exits 0 whenever it produced a list, and 2 only when it could not run
 * at all. It is outside the `project-validate` umbrella for the same reason
 * `docs-freeze` and `guard-generated` are outside it: the umbrella judges a
 * repository as it stands, and this does not judge anything.
 */

const TOOL = "wiki-drift";

/**
 * How many entries the prose form shows.
 *
 * A sweep is an afternoon, not a fortnight, and the prose form is the list
 * somebody works through. The full list is always in `--json`, so nothing is
 * lost by cutting the one a person reads.
 */
const DEFAULT_LIMIT = 20;

const HELP = `Usage: wiki-drift [--repo <dir>] [--json] [--limit <n>]

Orders the wiki pages by how much the code under their names has moved since
each page said it was current. Advisory: it orders review, it does not claim
coverage, and it never fails a run.

  --repo <dir>   Repository to sweep. Defaults to the enclosing repository.
  --json         Print the whole worklist as one JSON object.
  --limit <n>    How many entries to print. Defaults to ${DEFAULT_LIMIT}.
  -h, --help     Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo", "limit" ],
    aliases: { h: "help" },
};

export async function run(argv: string[], io: Io): Promise<number> {
    const args = preflight(argv, SPEC, HELP, io);
    if (typeof args === "number") {
        return args;
    }
    const json = args.booleans.has("json");

    const limit = parseLimit(value(args, "limit"));
    if (limit === undefined) {
        io.err("`--limit` takes a positive whole number.");
        io.err("");
        io.err(HELP);
        return EXIT.unusable;
    }

    const loaded = await loadContext(args, io, TOOL);
    if (loaded.kind === "unusable") {
        return loaded.code;
    }
    const { context } = loaded;

    if (!context.root.wiki) {
        // Not a fault and not a silence. A project that has not declared a
        // wiki has nothing to sweep, and the run should say which of the two
        // it is rather than printing an empty list.
        io.out(
            json
                ? payload(EMPTY, context.diagnostics, "No wiki declared.")
                : "No wiki declared, so there is nothing to sweep.",
        );
        return EXIT.ok;
    }

    const scan = await scanDrift(context.root, context.repoRoot);

    if (json) {
        io.out(payload(scan, context.diagnostics));
        return EXIT.ok;
    }
    for (const line of prose(scan, limit)) {
        io.out(line);
    }
    // Loading diagnostics are the profile's own problems, reported here
    // because a sweep run against a half-readable profile should say so, and
    // reported without failing because that is `profile-validate`'s job.
    for (const line of formatDiagnostics(context.diagnostics)) {
        io.out(line);
    }
    return EXIT.ok;
}

/** The worklist a run produces when there is no wiki to sweep. */
const EMPTY: DriftScan = {
    pages: 0,
    searched: 0,
    ageDays: 0,
    shallow: false,
    queued: [],
    quiet: [],
    dropped: [],
};

/**
 * The JSON form, which carries the loader's findings as well as the worklist.
 *
 * The prose form prints them under the list, and a reader of the JSON cannot
 * see the prose. Without them a machine consumer cannot tell a sweep that
 * measured what it claims from one that ran against a subdirectory, where git
 * reports commit dates against paths that do not match and every date the
 * worklist rests on is absent.
 */
function payload(
    scan: DriftScan,
    diagnostics: Diagnostic[],
    note?: string,
): string {
    return JSON.stringify(
        {
            tool: TOOL,
            ...scan,
            diagnostics,
            ...note === undefined ? {} : { note },
        },
        null,
        2,
    );
}

/** `--limit` as a count, or undefined if it is not one. */
function parseLimit(given: string | undefined): number | undefined {
    if (given === undefined) {
        return DEFAULT_LIMIT;
    }
    return /^[1-9][0-9]*$/.test(given) ? Number(given) : undefined;
}

function prose(scan: DriftScan, limit: number): string[] {
    const lines: string[] = [];
    const shown = scan.queued.slice(0, limit);

    for (const entry of shown) {
        lines.push(...entryLines(entry));
        lines.push("");
    }

    const hidden = scan.queued.length - shown.length;
    if (hidden > 0) {
        lines.push(
            `${hidden} more queued, not shown. Raise --limit or use --json.`,
        );
        lines.push("");
    }

    lines.push(
        `${plural(scan.pages, "page")} read, `
            + `${plural(scan.searched, "file")} searched.`,
    );
    lines.push(
        `${plural(scan.queued.length, "page")} queued, `
            + `${plural(scan.quiet.length, "page")} traced and unchanged.`,
    );
    if (scan.pages > 0 && scan.searched === 0) {
        // Otherwise this run is indistinguishable from a traced one that found
        // no churn, and the difference is the entire meaning of the output.
        lines.push(
            "Nothing outside the wiki and docs roots was searched, so no page "
                + "could be traced and this list is ordered by age alone. In a "
                + "docs-only repository that is the whole of the answer.",
        );
    }
    if (scan.shallow) {
        // First, above the counts, because it changes what every line under
        // it means. Nothing else the run says is measuring what it claims.
        lines.push(
            "This is a shallow clone, so commit dates are truncated and the "
                + "churn column is not real: everything older than the "
                + "boundary carries the boundary commit's date. Fetch the full "
                + "history where this runs.",
        );
    }
    if (scan.dropped.length > 0) {
        // Said out loud because a real name dropped here is a page that looks
        // traced and is not, and the only way anyone finds out is this line.
        lines.push(
            `Dropped as too common to grep: ${scan.dropped.join(", ")}.`,
        );
    }
    lines.push(
        "Advisory. This orders review; it does not claim coverage. A page "
            + `untraceable at ${scan.ageDays} days is surfaced on age alone.`,
    );
    return lines;
}

function entryLines(entry: DriftEntry): string[] {
    const age = entry.days === undefined
        ? "no usable date"
        : `${plural(entry.days, "day")} old`;
    const lines = [
        `${entry.path}  ${entry.reason}  (${age})`,
    ];

    if (entry.reason === "churn") {
        lines.push(
            `    ${entry.changed.length} of `
                + `${plural(entry.watched.length, "watched file")} changed `
                + `since ${entry.lastUpdated}, latest ${entry.latest}`,
        );
        for (const file of entry.changed.slice(0, 5)) {
            lines.push(`    ${file}`);
        }
        if (entry.changed.length > 5) {
            lines.push(`    and ${entry.changed.length - 5} more`);
        }
        return lines;
    }

    // Three ways to be untraceable, and they send a reader to three different
    // places. Collapsing them would tell the author of an undated page that
    // their names are gone from a repository those names are still in.
    if (entry.days === undefined) {
        lines.push(
            "    No usable `last_updated`, so there was no date to diff "
                + `against. ${plural(entry.watched.length, "file")} would `
                + "have been watched. `wiki-validate` reports the missing key.",
        );
        return lines;
    }
    lines.push(
        entry.names === 0
            ? "    No names to grep for, so nothing traced it. Reread it, or "
                + "give it the names its subject is known by."
            : `    ${plural(entry.names, "name")} extracted and none of them `
                + "is in the repository. Either the page is stale or its "
                + "names are not what the code calls them now.",
    );
    return lines;
}
