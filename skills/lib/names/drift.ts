import type { ExtractedName } from "./extract";

/**
 * The drift worklist: which wiki pages to reread, in what order.
 *
 * This is the step that makes housekeeping a skill rather than a reminder. An
 * unbounded instruction to review the wiki produces either nothing or a
 * fortnight of rereading, and neither is a sweep. Taking the names off a page,
 * finding the files that hold them today, and asking which of those moved
 * since the page said it was current turns the same instruction into an
 * ordered list with an end.
 *
 * It **orders review; it does not claim coverage.** Every entry carries the
 * reason it is there, because "the code under your names moved" and "nothing
 * here could be traced and the page is old" are different sentences, and a
 * reader who cannot tell them apart will act on the second as though it were
 * the first. A page that comes back quiet has had the files its names live in
 * checked against the date it declares. That is the whole of the claim.
 *
 * Nothing here writes. The sweep decides what to do with the list, and a tool
 * that rewrote pages by the output of a heuristic would be rewriting the wiki
 * on the strength of a grep.
 */

/**
 * How many files a single name may reach before it is discarded.
 *
 * A token in three hundred files is a word, not a name. Keeping it would put
 * every page mentioning it at the top of the list, which is the one outcome
 * that makes an ordered worklist worthless. The number is a heuristic and the
 * discard is reported, so a project seeing a real name dropped can see that
 * it was.
 */
export const MAX_FILES_PER_NAME = 200;

export interface DriftPage {
    slug: string;
    /** Repo-relative path, which is what an entry points a reader at. */
    path: string;
    /** The page's own `last_updated`, as written. */
    lastUpdated?: string;
    names: ExtractedName[];
}

/** Where the names live now, built once over the repository's own files. */
export interface NameIndex {
    /** Token to the repo-relative paths carrying it. */
    tokens: Map<string, string[]>;
    /** Every candidate path, which is what a cited path is matched against. */
    paths: string[];
}

export interface DriftInput {
    pages: DriftPage[];
    index: NameIndex;
    /** Repo-relative path to the ISO date it was last committed. */
    dates: Map<string, string>;
    now: Date;
    /** Age at which an untraceable page is surfaced on age alone. */
    ageDays: number;
}

/**
 * Why an entry is on the list, or why it is not.
 *
 * `churn` is the traced answer: files holding this page's names were committed
 * after the page's date. `untraceable` means the diff could not be done, which
 * covers a page with no names to grep, names that match nothing, and a page
 * carrying no usable date. `quiet` is a page that was traced and came back
 * unchanged.
 */
export type DriftReason = "churn" | "untraceable" | "quiet";

export interface DriftEntry {
    slug: string;
    path: string;
    lastUpdated?: string;
    /** Days since the page said it was current. Absent without a usable date. */
    days?: number;
    /** How many names were extracted, before any were dropped. */
    names: number;
    /** Files the page's names reach, sorted. */
    watched: string[];
    /** Those committed after the page's date, sorted. */
    changed: string[];
    /** The most recent of those, as YYYY-MM-DD. */
    latest?: string;
    reason: DriftReason;
}

export interface DriftWorklist {
    /** Ordered: most churn first, then oldest, then by slug. */
    queued: DriftEntry[];
    /** Traced and unchanged, in slug order. */
    quiet: DriftEntry[];
    /** Names discarded for reaching too many files, deduplicated and sorted. */
    dropped: string[];
}

export function buildWorklist(input: DriftInput): DriftWorklist {
    const dropped = new Set<string>();
    const entries = input.pages.map((page) => entryFor(page, input, dropped));

    return {
        queued: entries
            .filter((entry) => entry.reason !== "quiet")
            .sort(byUrgency),
        quiet: entries
            .filter((entry) => entry.reason === "quiet")
            .sort((a, b) => a.slug.localeCompare(b.slug)),
        dropped: [ ...dropped ].sort(),
    };
}

function entryFor(
    page: DriftPage,
    input: DriftInput,
    dropped: Set<string>,
): DriftEntry {
    const watched = new Set<string>();
    for (const name of page.names) {
        const hits = name.kind === "path"
            ? pathMatches(name.name, input.index.paths)
            : input.index.tokens.get(name.name) ?? [];
        if (hits.length > MAX_FILES_PER_NAME) {
            dropped.add(name.name);
            continue;
        }
        for (const hit of hits) {
            watched.add(hit);
        }
    }

    const day = declaredDay(page.lastUpdated);
    const changed = day === undefined ? [] : [ ...watched ].filter((file) => {
        const date = input.dates.get(file);
        return date !== undefined && date.slice(0, 10) > day;
    });
    changed.sort();

    const days = day === undefined ? undefined : daysSince(day, input.now);
    const stale = days !== undefined && days >= input.ageDays;

    return {
        slug: page.slug,
        path: page.path,
        lastUpdated: page.lastUpdated,
        days,
        names: page.names.length,
        watched: [ ...watched ].sort(),
        changed,
        latest: changed.length === 0
            ? undefined
            : changed
                .map((file) => (input.dates.get(file) ?? "").slice(0, 10))
                .sort()
                .at(-1),
        reason: reasonFor(changed.length, watched.size, day, stale),
    };
}

function reasonFor(
    changed: number,
    watched: number,
    day: string | undefined,
    stale: boolean,
): DriftReason {
    if (changed > 0) {
        return "churn";
    }
    // No date means nothing to diff against, at any age. The frontmatter
    // contract already reports the missing key; the sweep still has to say
    // something about the page rather than calling it clean by default.
    if (day === undefined) {
        return "untraceable";
    }
    // A traced page whose names have not moved is quiet however old it is.
    // That is the point of tracing: age alone is the fallback for pages the
    // grep could not reach, not a second clock running over the whole wiki.
    return watched === 0 && stale ? "untraceable" : "quiet";
}

/**
 * The files a cited path names.
 *
 * Exact first, then a match on the segment boundary, because a page cites the
 * path a reader would recognise rather than the one git uses:
 * `lib/pricing.ts` for a file the repository calls
 * `packages/api/lib/pricing.ts`. The boundary is what keeps `pricing.ts` from
 * also claiming `legacy-pricing.ts`.
 */
function pathMatches(name: string, paths: string[]): string[] {
    const exact = paths.filter((path) => path === name);
    if (exact.length > 0) {
        return exact;
    }
    return paths.filter((path) => path.endsWith(`/${name}`));
}

/** The page's date as YYYY-MM-DD, or undefined if it is not one. */
function declaredDay(lastUpdated: string | undefined): string | undefined {
    if (lastUpdated === undefined || !/^\d{4}-\d{2}-\d{2}/.test(lastUpdated)) {
        return undefined;
    }
    const day = lastUpdated.slice(0, 10);
    return Number.isNaN(new Date(day).getTime()) ? undefined : day;
}

function daysSince(day: string, now: Date): number {
    return Math.floor((now.getTime() - new Date(day).getTime()) / 86_400_000);
}

/**
 * Most churn first, then the oldest, then by slug so two runs over an
 * unchanged repository print the same list in the same order.
 *
 * A page with no date sorts as maximally old, which is what it is: nothing
 * about it can be dated at all.
 */
function byUrgency(a: DriftEntry, b: DriftEntry): number {
    if (a.changed.length !== b.changed.length) {
        return b.changed.length - a.changed.length;
    }
    const age = (entry: DriftEntry) => entry.days ?? Number.POSITIVE_INFINITY;
    if (age(a) !== age(b)) {
        return age(b) - age(a);
    }
    return a.slug.localeCompare(b.slug);
}
