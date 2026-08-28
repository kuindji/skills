import { describe, expect, test } from "bun:test";
import {
    buildWorklist,
    type DriftInput,
    type DriftPage,
    MAX_FILES_PER_NAME,
    type NameIndex,
} from "./drift";
import type { ExtractedName } from "./extract";

/**
 * The worklist, held to the one claim it makes: it orders review.
 *
 * Not coverage. A page that comes back quiet has had the files its names live
 * in checked against the date it declares, and that is all. The reason a page
 * is queued is part of the entry for exactly that reason: "your names moved"
 * and "nothing here could be traced, and it is old" are different sentences,
 * and a reader who cannot tell them apart will read the second as the first.
 */

function symbol(name: string): ExtractedName {
    return { name, kind: "symbol", line: 1 };
}

function path(name: string): ExtractedName {
    return { name, kind: "path", line: 1 };
}

function wikiPage(
    slug: string,
    lastUpdated: string | undefined,
    names: ExtractedName[],
): DriftPage {
    return { slug, path: `docs/wiki/${slug}.md`, lastUpdated, names };
}

/** An index built the way the scan builds one, from a plain description. */
function index(files: Record<string, string[]>): NameIndex {
    const tokens = new Map<string, string[]>();
    for (const [ file, held ] of Object.entries(files)) {
        for (const token of held) {
            tokens.set(token, [ ...tokens.get(token) ?? [], file ]);
        }
    }
    return { tokens, paths: Object.keys(files) };
}

const NOW = new Date("2026-08-28T00:00:00Z");

function run(input: Partial<DriftInput> & { pages: DriftPage[]; }) {
    return buildWorklist({
        index: index({}),
        dates: new Map(),
        now: NOW,
        ageDays: 90,
        ...input,
    });
}

describe("churn", () => {
    test("a page is queued when a file its names live in changed since", () => {
        const result = run({
            pages: [
                wikiPage("orders", "2026-05-02", [ symbol("rate_table") ]),
            ],
            index: index({ "src/pricing.ts": [ "rate_table" ] }),
            dates: new Map([ [ "src/pricing.ts", "2026-08-20T09:00:00Z" ] ]),
        });
        expect(result.queued.map((e) => e.slug)).toEqual([ "orders" ]);
        const [ entry ] = result.queued;
        expect(entry?.reason).toBe("churn");
        expect(entry?.changed).toEqual([ "src/pricing.ts" ]);
        expect(entry?.latest).toBe("2026-08-20");
    });

    test("a page whose files all predate its date is quiet", () => {
        const result = run({
            pages: [
                wikiPage("orders", "2026-05-02", [ symbol("rate_table") ]),
            ],
            index: index({ "src/pricing.ts": [ "rate_table" ] }),
            dates: new Map([ [ "src/pricing.ts", "2026-04-01T09:00:00Z" ] ]),
        });
        expect(result.queued).toEqual([]);
        expect(result.quiet.map((e) => e.slug)).toEqual([ "orders" ]);
    });

    /**
     * A file git has never seen has no history to have changed in. Counting
     * it would queue every page next to an uncommitted scratch file.
     */
    test("a watched file with no commit date is not a change", () => {
        const result = run({
            pages: [
                wikiPage("orders", "2026-05-02", [ symbol("rate_table") ]),
            ],
            index: index({ "src/pricing.ts": [ "rate_table" ] }),
            dates: new Map(),
        });
        expect(result.queued).toEqual([]);
        expect(result.quiet[0]?.watched).toEqual([ "src/pricing.ts" ]);
    });

    test("one file reached by two names is watched once", () => {
        const result = run({
            pages: [
                wikiPage("orders", "2026-05-02", [
                    symbol("rate_table"),
                    symbol("priceFor"),
                ]),
            ],
            index: index({ "src/pricing.ts": [ "rate_table", "priceFor" ] }),
            dates: new Map([ [ "src/pricing.ts", "2026-08-20T09:00:00Z" ] ]),
        });
        expect(result.queued[0]?.watched).toEqual([ "src/pricing.ts" ]);
        expect(result.queued[0]?.changed).toEqual([ "src/pricing.ts" ]);
    });
});

describe("paths", () => {
    test("a cited path is watched exactly", () => {
        const result = run({
            pages: [
                wikiPage("orders", "2026-05-02", [ path("src/pricing.ts") ]),
            ],
            index: index({ "src/pricing.ts": [], "src/other.ts": [] }),
            dates: new Map([ [ "src/pricing.ts", "2026-08-20T09:00:00Z" ] ]),
        });
        expect(result.queued[0]?.changed).toEqual([ "src/pricing.ts" ]);
    });

    /**
     * A page cites the path a reader would recognise, which is rarely the
     * repo-relative one: `lib/pricing.ts` for a file that git calls
     * `packages/api/lib/pricing.ts`. Matching on the segment boundary is what
     * makes the ordinary citation traceable, and the boundary is what stops
     * `pricing.ts` from also claiming `legacy-pricing.ts`.
     */
    test("a cited path matches on a segment boundary", () => {
        const result = run({
            pages: [ wikiPage("orders", "2026-05-02", [ path("pricing.ts") ]) ],
            index: index({
                "packages/api/lib/pricing.ts": [],
                "packages/api/lib/legacy-pricing.ts": [],
            }),
            dates: new Map([
                [ "packages/api/lib/pricing.ts", "2026-08-20T09:00:00Z" ],
                [
                    "packages/api/lib/legacy-pricing.ts",
                    "2026-08-20T09:00:00Z",
                ],
            ]),
        });
        expect(result.queued[0]?.watched).toEqual([
            "packages/api/lib/pricing.ts",
        ]);
    });
});

describe("what cannot be traced", () => {
    test("an old page with no names is queued on age alone", () => {
        const result = run({
            pages: [ wikiPage("policy", "2026-01-02", []) ],
        });
        expect(result.queued.map((e) => [ e.slug, e.reason ])).toEqual([
            [ "policy", "untraceable" ],
        ]);
        expect(result.queued[0]?.days).toBe(238);
    });

    test("an old page whose names match nothing is the same case", () => {
        const result = run({
            pages: [
                wikiPage("policy", "2026-01-02", [ symbol("gone_table") ]),
            ],
            index: index({ "src/pricing.ts": [ "rate_table" ] }),
        });
        expect(result.queued[0]?.reason).toBe("untraceable");
    });

    test("a recent page with no names is not queued", () => {
        const result = run({
            pages: [ wikiPage("policy", "2026-08-01", []) ],
        });
        expect(result.queued).toEqual([]);
        expect(result.quiet.map((e) => e.slug)).toEqual([ "policy" ]);
    });

    /**
     * Without a date there is nothing to diff against, at any age. The
     * frontmatter contract already makes this an error; the sweep still has
     * to say something about the page rather than quietly calling it clean.
     */
    test("a page with no usable date is queued whatever its names do", () => {
        for (const date of [ undefined, "not a date" ]) {
            const result = run({
                pages: [ wikiPage("orders", date, [ symbol("rate_table") ]) ],
                index: index({ "src/pricing.ts": [ "rate_table" ] }),
                dates: new Map([ [
                    "src/pricing.ts",
                    "2026-04-01T09:00:00Z",
                ] ]),
            });
            expect(result.queued[0]?.reason).toBe("untraceable");
            expect(result.queued[0]?.days).toBeUndefined();
        }
    });
});

/**
 * A token that lives in three hundred files is a word, not a name. Keeping it
 * would put every page that mentions it at the top of the list, which is the
 * one outcome that makes an ordered worklist worthless.
 */
test("a name that matches too much is dropped and said out loud", () => {
    const everywhere = Object.fromEntries(
        Array.from(
            { length: MAX_FILES_PER_NAME + 1 },
            (_, i) => [ `src/file-${i}.ts`, [ "handler" ] ],
        ),
    );
    const result = run({
        pages: [ wikiPage("orders", "2026-05-02", [ symbol("handler") ]) ],
        index: index(everywhere),
        dates: new Map([ [ "src/file-0.ts", "2026-08-20T09:00:00Z" ] ]),
    });
    expect(result.dropped).toEqual([ "handler" ]);
    expect(result.queued[0]?.reason).toBe("untraceable");
});

/**
 * Ordering is the product. Churn first, because a page whose subject moved
 * last week is the one worth an hour today.
 */
test("the queue is ordered by churn, then by age, then by slug", () => {
    const result = run({
        pages: [
            wikiPage("quiet-old", "2026-01-01", [ symbol("one") ]),
            wikiPage("busy", "2026-05-02", [ symbol("two"), symbol("three") ]),
            wikiPage("untraced", "2026-01-01", []),
            wikiPage("older-untraced", "2025-01-01", []),
            wikiPage("b-same-age", "2026-05-02", [ symbol("four") ]),
            wikiPage("a-same-age", "2026-05-02", [ symbol("five") ]),
        ],
        index: index({
            "src/one.ts": [ "one" ],
            "src/two.ts": [ "two" ],
            "src/three.ts": [ "three" ],
            "src/four.ts": [ "four" ],
            "src/five.ts": [ "five" ],
        }),
        dates: new Map([
            [ "src/one.ts", "2025-06-01T00:00:00Z" ],
            [ "src/two.ts", "2026-08-20T00:00:00Z" ],
            [ "src/three.ts", "2026-08-21T00:00:00Z" ],
            [ "src/four.ts", "2026-08-20T00:00:00Z" ],
            [ "src/five.ts", "2026-08-20T00:00:00Z" ],
        ]),
    });
    expect(result.queued.map((e) => e.slug)).toEqual([
        "busy",
        "a-same-age",
        "b-same-age",
        "older-untraced",
        "untraced",
    ]);
    expect(result.quiet.map((e) => e.slug)).toEqual([ "quiet-old" ]);
});
