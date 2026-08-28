import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../markdown/frontmatter";
import { bodyHash } from "./freeze";
import { type DocFile, validateLifecycleDocs } from "./lifecycle";

const NOW = new Date("2026-08-27T12:00:00Z");
const BODY = "# A decision\n\nWhat was decided, and why.\n";

interface Spec {
    name?: string;
    type?: string | false;
    status?: string | false;
    body?: string;
    extra?: Record<string, string>;
    noFrontmatter?: boolean;
}

function doc(spec: Spec = {}): DocFile {
    const name = spec.name ?? "2026-08-27-a-decision.md";
    const body = spec.body ?? BODY;
    if (spec.noFrontmatter) {
        return {
            path: `docs/specs/${name}`,
            frontmatter: parseFrontmatter(body),
        };
    }
    const keys: string[] = [];
    if (spec.type !== false) {
        keys.push(`type: ${spec.type ?? "spec"}`);
    }
    if (spec.status !== false) {
        keys.push(`status: ${spec.status ?? "draft"}`);
    }
    for (const [ key, value ] of Object.entries(spec.extra ?? {})) {
        keys.push(`${key}: ${value}`);
    }
    return {
        path: `docs/specs/${name}`,
        frontmatter: parseFrontmatter(`---\n${keys.join("\n")}\n---\n${body}`),
    };
}

function check(docs: DocFile[], overrides: Partial<{
    staleAfterDays: number;
    wikiSlugs: Set<string>;
    commitDates: Map<string, string>;
}> = {}) {
    return validateLifecycleDocs(docs, {
        staleAfterDays: 30,
        wikiSlugs: new Set([ "architecture", "architecture/wiki" ]),
        commitDates: new Map(),
        now: NOW,
        ...overrides,
    });
}

const rules = (docs: DocFile[], overrides?: Parameters<typeof check>[1]) =>
    check(docs, overrides).map((d) => d.rule);

test("a draft that is well formed says nothing", () => {
    expect(check([ doc() ])).toEqual([]);
});

describe("naming", () => {
    test("a name without a date is an error", () => {
        const found = check([ doc({ name: "a-decision.md" }) ]);
        expect(found.map((d) => d.rule)).toEqual([ "docs.lifecycleName" ]);
        // The remedy has to name the way out, not only the fault.
        expect(found[0]!.remedy).toContain("reference");
    });

    test("an impossible date is an error", () => {
        expect(rules([ doc({ name: "2026-13-45-a-decision.md" }) ])).toEqual([
            "docs.lifecycleName",
        ]);
    });

    test("a leap day that exists is fine", () => {
        expect(rules([ doc({ name: "2028-02-29-a-decision.md" }) ])).toEqual(
            [],
        );
    });

    test("a leap day that does not exist is an error", () => {
        expect(rules([ doc({ name: "2026-02-29-a-decision.md" }) ])).toEqual([
            "docs.lifecycleName",
        ]);
    });

    test("a date with no topic after it is an error", () => {
        expect(rules([ doc({ name: "2026-08-27.md" }) ])).toEqual([
            "docs.lifecycleName",
        ]);
    });
});

describe("the frontmatter contract", () => {
    test("no frontmatter at all is one error, not one per key", () => {
        expect(rules([ doc({ noFrontmatter: true }) ])).toEqual([
            "docs.lifecycleFrontmatter",
        ]);
    });

    test("a missing type is an error", () => {
        expect(rules([ doc({ type: false }) ])).toEqual([
            "docs.lifecycleFrontmatter",
        ]);
    });

    test("an unknown status is an error naming the three", () => {
        const found = check([ doc({ status: "in-progress" }) ]);
        expect(found.map((d) => d.rule)).toEqual([ "docs.lifecycleStatus" ]);
        expect(found[0]!.message).toContain("draft, active, shipped");
    });

    test("an unusable status suppresses the rules that read it", () => {
        expect(rules([ doc({ status: false }) ])).toEqual([
            "docs.lifecycleStatus",
        ]);
    });

    test("keys beyond the two required ones are legal", () => {
        expect(rules([ doc({ extra: { reviewed_by: "gpt-5.5" } }) ])).toEqual(
            [],
        );
    });
});

/**
 * A block that did not parse holds no keys, so reporting `type` and `status`
 * as absent points the author at two keys sitting visibly on the page. The
 * shape that does it is a flow collection split over several lines, which is
 * valid YAML the parser here refuses, and which is what an author writes when
 * a `folded_into` list outgrows one line.
 */
describe("a frontmatter block that does not parse", () => {
    const broken: DocFile = {
        path: "docs/specs/2026-08-27-a-decision.md",
        frontmatter: parseFrontmatter(
            "---\ntype: spec\nstatus: shipped\nfolded_into: [\n  a,\n]\n"
                + `---\n${BODY}`,
        ),
    };

    test("is reported as itself, not as two absent keys", () => {
        const found = check([ broken ]);
        expect(found.map((d) => d.rule)).toEqual([
            "docs.lifecycleFrontmatter",
        ]);
        expect(found[0]?.message).toContain("did not parse");
    });

    test("the remedy names what actually causes it", () => {
        expect(check([ broken ])[0]?.remedy).toContain("one line");
    });
});

describe("the fold gate", () => {
    const shipped = (extra: Record<string, string>) =>
        doc({ status: "shipped", extra: { ...extra } });

    test("shipping without folded_into is an error", () => {
        const found = check([
            shipped({ frozen_body_sha256: bodyHash(BODY) }),
        ]);
        expect(found.map((d) => d.rule)).toEqual([ "docs.foldGate" ]);
    });

    test("an empty folded_into does not satisfy the gate", () => {
        expect(rules([
            shipped({
                folded_into: "[]",
                frozen_body_sha256: bodyHash(BODY),
            }),
        ])).toEqual([ "docs.foldGate" ]);
    });

    test("a slug that does not resolve is an error", () => {
        expect(rules([
            shipped({
                folded_into: "[architecture, ghost]",
                frozen_body_sha256: bodyHash(BODY),
            }),
        ])).toEqual([ "docs.foldGate" ]);
    });

    test("resolving slugs pass", () => {
        expect(rules([
            shipped({
                folded_into: "[architecture, architecture/wiki]",
                frozen_body_sha256: bodyHash(BODY),
            }),
        ])).toEqual([]);
    });

    test("a draft is not held to the gate", () => {
        expect(rules([ doc({ status: "draft" }) ])).toEqual([]);
    });
});

describe("freezing", () => {
    const shipped = (extra: Record<string, string>, body?: string) =>
        doc({
            status: "shipped",
            body,
            extra: { folded_into: "[architecture]", ...extra },
        });

    test("shipping with no hash is an error", () => {
        expect(rules([ shipped({}) ])).toEqual([ "docs.frozen" ]);
    });

    test("a matching hash passes", () => {
        expect(rules([ shipped({ frozen_body_sha256: bodyHash(BODY) }) ]))
            .toEqual([]);
    });

    test("an edited body is an error naming both hashes", () => {
        const found = check([
            shipped({ frozen_body_sha256: bodyHash(BODY) }, "# Rewritten\n"),
        ]);
        expect(found.map((d) => d.rule)).toEqual([ "docs.frozen" ]);
        expect(found[0]!.message).toContain(bodyHash(BODY).slice(0, 12));
    });

    // Both are honest reasons to edit a frozen document, and both leave a
    // record. Editing one silently leaves none.
    const replacement = doc({ name: "2026-09-01-the-replacement.md" });

    test("`supersedes` naming a real later document excuses a changed body", () => {
        expect(rules([
            shipped(
                {
                    frozen_body_sha256: bodyHash(BODY),
                    supersedes: "2026-09-01-the-replacement.md",
                },
                "# Rewritten\n",
            ),
            replacement,
        ])).toEqual([]);
    });

    test("a repo-relative path resolves too", () => {
        expect(rules([
            shipped(
                {
                    frozen_body_sha256: bodyHash(BODY),
                    supersedes: "docs/specs/2026-09-01-the-replacement.md",
                },
                "# Rewritten\n",
            ),
            replacement,
        ])).toEqual([]);
    });

    // An unresolvable `supersedes` is the more dangerous case, not the lesser
    // one: it reads as accounted for and exempts the document forever.
    test("`supersedes` naming nothing is an error, not an excuse", () => {
        expect(rules([
            shipped(
                { frozen_body_sha256: bodyHash(BODY), supersedes: "nope" },
                "# Rewritten\n",
            ),
        ])).toEqual([ "docs.supersedes" ]);
    });

    test("a document cannot be superseded by an earlier one", () => {
        expect(rules([
            shipped(
                {
                    frozen_body_sha256: bodyHash(BODY),
                    supersedes: "2026-01-01-the-predecessor.md",
                },
                "# Rewritten\n",
            ),
            doc({ name: "2026-01-01-the-predecessor.md" }),
        ])).toEqual([ "docs.supersedes" ]);
    });

    test("a document cannot supersede itself", () => {
        expect(rules([
            shipped(
                {
                    frozen_body_sha256: bodyHash(BODY),
                    supersedes: "2026-08-27-a-decision.md",
                },
                "# Rewritten\n",
            ),
        ])).toEqual([ "docs.supersedes" ]);
    });

    test("`reopened_reason` excuses a changed body", () => {
        expect(rules([
            shipped(
                {
                    frozen_body_sha256: bodyHash(BODY),
                    reopened_reason: '"the vendor changed the contract"',
                },
                "# Rewritten\n",
            ),
        ])).toEqual([]);
    });

    // The hash exists so that the routine does not fire it.
    test("reformatting does not break the freeze", () => {
        const reformatted =
            "# A decision   \r\n\r\nWhat was decided, and why.\r\n\r\n";
        expect(rules([
            shipped({ frozen_body_sha256: bodyHash(BODY) }, reformatted),
        ])).toEqual([]);
    });
});

describe("staleness", () => {
    const active = doc({ status: "active" });
    const path = active.path;

    test("an active document committed recently is fine", () => {
        expect(rules([ active ], {
            commitDates: new Map([ [ path, "2026-08-20T00:00:00Z" ] ]),
        })).toEqual([]);
    });

    test("an active document past the limit is a warning", () => {
        const found = check([ active ], {
            commitDates: new Map([ [ path, "2026-06-01T00:00:00Z" ] ]),
        });
        expect(found.map((d) => d.rule)).toEqual([ "docs.stale" ]);
        expect(found[0]!.severity).toBe("warning");
        expect(found[0]!.message).toContain("87 days");
    });

    test("a draft is not aged, only an active one is", () => {
        expect(rules([ doc({ status: "draft" }) ], {
            commitDates: new Map([ [ path, "2026-01-01T00:00:00Z" ] ]),
        })).toEqual([]);
    });

    // An uncommitted file has no history to be stale against.
    test("a document git has never seen is not stale", () => {
        expect(rules([ active ])).toEqual([]);
    });
});
