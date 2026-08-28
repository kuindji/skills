import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "../profile/types";
import { MAX_WORDS, validateWikiGraph, WARN_WORDS } from "./graph";
import { parseWikiPage, type WikiPage } from "./page";

interface PageSpec {
    title?: string;
    parents?: unknown;
    children?: unknown;
    related_pages?: unknown;
    last_updated?: string;
    extra?: Record<string, string>;
    body?: string;
}

/** Build a well-formed page, so a test only states what it is changing. */
function make(slug: string, spec: PageSpec = {}): WikiPage {
    const fm: string[] = [
        `title: ${spec.title ?? slug}`,
        `parents: ${yamlList(spec.parents ?? (slug === "README" ? [] : []))}`,
        `children: ${yamlList(spec.children ?? [])}`,
        `related_pages: ${yamlList(spec.related_pages ?? [])}`,
        `last_updated: ${spec.last_updated ?? "2026-08-27"}`,
    ];
    for (const [ key, value ] of Object.entries(spec.extra ?? {})) {
        fm.push(`${key}: ${value}`);
    }
    const source = `---\n${fm.join("\n")}\n---\n${spec.body ?? "Body.\n"}`;
    return parseWikiPage(source, slug, `docs/wiki/${slug}.md`);
}

function yamlList(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    }
    return String(value);
}

const rules = (diagnostics: Diagnostic[]) => diagnostics.map((d) => d.rule);

/**
 * A block that did not parse holds no keys, and reporting each of them as
 * absent sends the reader hunting for keys that are visibly on the page. The
 * shape that does it here is a flow collection split over several lines,
 * which is valid YAML the parser this system uses refuses, and which is what
 * an author writes when a `children` list outgrows one line.
 */
describe("a frontmatter block that does not parse", () => {
    const page = parseWikiPage(
        "---\ntitle: Orders\nparents: []\nchildren: [\n  a,\n]\n"
            + "related_pages: []\nlast_updated: 2026-08-27\n---\nBody.\n",
        "orders",
        "docs/wiki/orders.md",
    );

    const onThePage = () =>
        validateWikiGraph([ page ])
            .filter((d) => d.file === "docs/wiki/orders.md");

    test("is reported as itself, not as five absent keys", () => {
        const found = onThePage();
        expect(rules(found)).toEqual([ "wiki.frontmatterShape" ]);
        expect(found[0]?.message).toContain("did not parse");
    });

    test("the remedy names what actually causes it", () => {
        expect(onThePage()[0]?.remedy).toContain("one line");
    });
});

/** The smallest wiki that passes everything: a README and one child. */
function minimalWiki(): WikiPage[] {
    return [
        make("README", {
            children: [ "services" ],
            body: "See [[services]].\n",
        }),
        make("services", { parents: [ "README" ] }),
    ];
}

test("a well-formed wiki produces no diagnostics", () => {
    expect(validateWikiGraph(minimalWiki())).toEqual([]);
});

test("an empty wiki is not a graph problem", () => {
    expect(validateWikiGraph([])).toEqual([]);
});

describe("frontmatter contract", () => {
    test("a missing title is an error", () => {
        const pages = minimalWiki();
        pages[1] = make("services", { parents: [ "README" ], title: '""' });
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.frontmatterShape",
        );
    });

    test("an absent list field is an error, and `[]` is not", () => {
        const withAbsent = parseWikiPage(
            "---\ntitle: T\nparents: [README]\nchildren: []\nlast_updated: 2026-08-27\n---\nB\n",
            "services",
            "docs/wiki/services.md",
        );
        const found = validateWikiGraph([
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            withAbsent,
        ]);
        expect(rules(found)).toEqual([ "wiki.frontmatterShape" ]);
        expect(found[0]!.keyPath).toBe("related_pages");
    });

    test("a sixth key is an error", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            extra: { tags: "[api]" },
        });
        const found = validateWikiGraph(pages);
        expect(rules(found)).toEqual([ "wiki.frontmatterKey" ]);
        expect(found[0]!.line).toBe(7);
    });

    test("last_updated must be an ISO date", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            last_updated: "last week",
        });
        expect(rules(validateWikiGraph(pages))).toEqual([
            "wiki.lastUpdated",
        ]);
    });

    test("a malformed edge list suppresses the graph rules for that page", () => {
        const pages = minimalWiki();
        // `parents: 3` would otherwise also read as an orphan and as a page
        // the README fails to list.
        pages[1] = make("services", { parents: 3 });
        expect(rules(validateWikiGraph(pages))).toEqual([
            "wiki.frontmatterShape",
        ]);
    });

    test("a page whose sibling is malformed is not blamed for it", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            make("services", { parents: [ "README" ], children: 7 }),
        ];
        const found = validateWikiGraph(pages);
        expect(found).toHaveLength(1);
        expect(found[0]!.file).toBe("docs/wiki/services.md");
    });
});

describe("duplicate keys", () => {
    /**
     * YAML keeps the last of two and says nothing, so the page shows one title
     * to a reader scanning from the top and another to everything that walks
     * it.
     */
    test("a key written twice is an error", () => {
        const pages = minimalWiki();
        pages[1] = parseWikiPage(
            "---\ntitle: Services\ntitle: Other Services\n"
                + "parents: [README]\nchildren: []\nrelated_pages: []\n"
                + "last_updated: 2026-08-27\n---\nBody.\n",
            "services",
            "docs/wiki/services.md",
        );
        const found = validateWikiGraph(pages);
        expect(rules(found)).toEqual([ "wiki.duplicateKey" ]);
        expect(found[0]!.message).toContain("title");
    });

    test("a quoted spelling is the same key", () => {
        const pages = minimalWiki();
        pages[1] = parseWikiPage(
            '---\n"title": Services\ntitle: Other Services\n'
                + "parents: [README]\nchildren: []\nrelated_pages: []\n"
                + "last_updated: 2026-08-27\n---\nBody.\n",
            "services",
            "docs/wiki/services.md",
        );
        expect(rules(validateWikiGraph(pages))).toEqual([
            "wiki.duplicateKey",
        ]);
    });
});

describe("parents and children", () => {
    test("the README must not have parents", () => {
        const pages = minimalWiki();
        pages[0] = make("README", {
            parents: [ "services" ],
            children: [ "services" ],
            body: "See [[services]].\n",
        });
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.rootHasParents",
        );
    });

    test("a page with no parents is an orphan", () => {
        const pages = minimalWiki();
        pages[1] = make("services", { parents: [] });
        expect(rules(validateWikiGraph(pages))).toContain("wiki.orphan");
    });

    test("a parent that does not exist is reported", () => {
        const pages = minimalWiki();
        pages[1] = make("services", { parents: [ "missing" ] });
        const found = validateWikiGraph(pages);
        const missing = found.find((d) => d.rule === "wiki.missingParent");
        expect(missing?.line).toBe(3);
    });

    test("a one-sided parent edge is asymmetric", () => {
        const pages = [
            make("README", { children: [], body: "Nothing here.\n" }),
            make("services", { parents: [ "README" ] }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.asymmetricParentChild",
        );
    });

    test("a one-sided child edge is asymmetric", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            make("services", { parents: [] }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.asymmetricParentChild",
        );
    });

    test("a child must live under its parent's directory", () => {
        const pages = [
            make("README", {
                children: [ "services", "data" ],
                body: "See [[services]] and [[data]].\n",
            }),
            make("services", {
                parents: [ "README" ],
                children: [ "data" ],
            }),
            make("data", { parents: [ "README", "services" ] }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.childNotUnderParent",
        );
    });

    test("a README child must be top-level", () => {
        const pages = [
            make("README", {
                children: [ "services/orders" ],
                body: "See [[services/orders]].\n",
            }),
            make("services/orders", { parents: [ "README" ] }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.childNotUnderParent",
        );
    });

    test("a nested child under its own parent is fine", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            make("services", {
                parents: [ "README" ],
                children: [ "services/orders" ],
                body: "See [[services/orders]].\n",
            }),
            make("services/orders", { parents: [ "services" ] }),
        ];
        expect(validateWikiGraph(pages)).toEqual([]);
    });
});

describe("related pages", () => {
    test("relatedness must be declared from both ends", () => {
        const pages = [
            make("README", {
                children: [ "a", "b" ],
                body: "See [[a]] and [[b]].\n",
            }),
            make("a", { parents: [ "README" ], related_pages: [ "b" ] }),
            make("b", { parents: [ "README" ] }),
        ];
        expect(rules(validateWikiGraph(pages))).toEqual([
            "wiki.asymmetricRelated",
        ]);
    });

    test("a symmetric pair passes", () => {
        const pages = [
            make("README", {
                children: [ "a", "b" ],
                body: "See [[a]] and [[b]].\n",
            }),
            make("a", { parents: [ "README" ], related_pages: [ "b" ] }),
            make("b", { parents: [ "README" ], related_pages: [ "a" ] }),
        ];
        expect(validateWikiGraph(pages)).toEqual([]);
    });

    test("a related page that does not exist is reported", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            related_pages: [ "ghost" ],
        });
        expect(rules(validateWikiGraph(pages))).toEqual([
            "wiki.missingRelated",
        ]);
    });
});

describe("body links", () => {
    test("a link that does not resolve is an error at its line", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            body: "Line one.\n\nSee [[nowhere]].\n",
        });
        const found = validateWikiGraph(pages);
        expect(rules(found)).toEqual([ "wiki.brokenLink" ]);
        expect(found[0]!.line).toBe(10);
    });
});

describe("size budget", () => {
    const words = (count: number) => `${"word ".repeat(count).trim()}\n`;

    test("a page at the target is silent", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            body: words(WARN_WORDS),
        });
        expect(validateWikiGraph(pages)).toEqual([]);
    });

    test("over the target is a warning", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            body: words(WARN_WORDS + 1),
        });
        const found = validateWikiGraph(pages);
        expect(rules(found)).toEqual([ "wiki.sizeBudget" ]);
        expect(found[0]!.severity).toBe("warning");
    });

    test("over the limit is an error", () => {
        const pages = minimalWiki();
        pages[1] = make("services", {
            parents: [ "README" ],
            body: words(MAX_WORDS + 1),
        });
        const found = validateWikiGraph(pages);
        expect(found[0]!.severity).toBe("error");
        expect(found[0]!.message).toContain(String(MAX_WORDS + 1));
    });
});

describe("reachability", () => {
    test("a page linked from nowhere is unreachable", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            make("services", {
                parents: [ "README" ],
                children: [ "services/orders" ],
                body: "No link in the prose.\n",
            }),
            make("services/orders", { parents: [ "services" ] }),
        ];
        // `children` is walked too, so a declared child is reachable.
        expect(validateWikiGraph(pages)).toEqual([]);
    });

    test("a page reachable only by its own parents claim is unreachable", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]].\n",
            }),
            make("services", {
                parents: [ "README" ],
                children: [],
                body: "Nothing below.\n",
            }),
            make("services/orders", { parents: [ "services" ] }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain("wiki.unreachable");
    });

    test("a wiki with pages but no README is an error", () => {
        const found = validateWikiGraph([ make("services", { parents: [] }) ], {
            wikiRoot: "docs/wiki",
        });
        const missing = found.find((d) => d.rule === "wiki.noReadme");
        expect(missing?.file).toBe("docs/wiki/README.md");
    });

    test("a malformed README does not report every page as unreachable", () => {
        const pages = [
            make("README", { children: "not-a-list" }),
            make("services", { parents: [ "README" ] }),
            make("data", { parents: [ "README" ] }),
        ];
        const found = validateWikiGraph(pages);
        expect(rules(found)).toEqual([ "wiki.frontmatterShape" ]);
    });

    test("a top-level page missing from the README is reported", () => {
        const pages = [
            make("README", {
                children: [ "services" ],
                body: "See [[services]] and [[data]].\n",
            }),
            make("services", { parents: [ "README" ] }),
            make("data", {
                parents: [ "services" ],
                body: "Reachable by the README's prose link.\n",
            }),
        ];
        expect(rules(validateWikiGraph(pages))).toContain(
            "wiki.readmeMissingTopLevel",
        );
    });
});

describe("a self-contained subtree", () => {
    function wiki(): WikiPage[] {
        return [
            make("README", {
                children: [ "business", "services" ],
                body: "See [[business]] and [[services]].\n",
            }),
            make("business", {
                parents: [ "README" ],
                children: [ "business/orders" ],
                body: "See [[business/orders]].\n",
            }),
            make("business/orders", { parents: [ "business" ] }),
            make("services", { parents: [ "README" ] }),
        ];
    }

    const subtree = { businessSubtree: "business" };

    test("edges inside the subtree pass, including the index's README parent", () => {
        expect(validateWikiGraph(wiki(), subtree)).toEqual([]);
    });

    /**
     * The parent edge is the whole exception. Any other edge from the index to
     * the README is dead wherever the subtree ships, and the README's
     * reciprocal half of it is content that does not travel.
     */
    test("only the parent edge to the README is allowed out", () => {
        const pages = wiki();
        pages[0] = make("README", {
            children: [ "business", "services" ],
            related_pages: [ "business" ],
            body: "See [[business]] and [[services]].\n",
        });
        pages[1] = make("business", {
            parents: [ "README" ],
            children: [ "business/orders" ],
            related_pages: [ "README" ],
            body: "See [[business/orders]].\n",
        });
        expect(rules(validateWikiGraph(pages, subtree)))
            .toEqual([ "wiki.subtreeLeak" ]);
    });

    test("a body link from the index to the README is a leak", () => {
        const pages = wiki();
        pages[1] = make("business", {
            parents: [ "README" ],
            children: [ "business/orders" ],
            body: "Back to [[README]], and [[business/orders]].\n",
        });
        expect(rules(validateWikiGraph(pages, subtree)))
            .toEqual([ "wiki.subtreeLeak" ]);
    });

    test("a body link out of the subtree is a leak", () => {
        const pages = wiki();
        pages[2] = make("business/orders", {
            parents: [ "business" ],
            body: "How orders work, see [[services]].\n",
        });
        const found = validateWikiGraph(pages, subtree);
        expect(rules(found)).toEqual([ "wiki.subtreeLeak" ]);
        expect(found[0]!.line).toBe(8);
    });

    test("a related_pages edge out of the subtree is a leak", () => {
        const pages = wiki();
        pages[2] = make("business/orders", {
            parents: [ "business" ],
            related_pages: [ "services" ],
        });
        pages[3] = make("services", {
            parents: [ "README" ],
            related_pages: [ "business/orders" ],
        });
        expect(rules(validateWikiGraph(pages, subtree))).toEqual([
            "wiki.subtreeLeak",
        ]);
    });

    test("only the subtree index may parent the README", () => {
        const pages = wiki();
        pages[2] = make("business/orders", {
            parents: [ "business", "README" ],
        });
        pages[0] = make("README", {
            children: [ "business", "services", "business/orders" ],
            body: "See [[business]] and [[services]].\n",
        });
        expect(rules(validateWikiGraph(pages, subtree))).toContain(
            "wiki.subtreeLeak",
        );
    });

    test("a trailing slash does not switch the rule off", () => {
        const pages = wiki();
        pages[2] = make("business/orders", {
            parents: [ "business" ],
            body: "How orders work, see [[services]].\n",
        });
        expect(
            rules(validateWikiGraph(pages, { businessSubtree: "business/" })),
        )
            .toEqual([ "wiki.subtreeLeak" ]);
    });

    test("with no subtree declared, the same edges are fine", () => {
        const pages = wiki();
        pages[2] = make("business/orders", {
            parents: [ "business" ],
            body: "How orders work, see [[services]].\n",
        });
        expect(validateWikiGraph(pages)).toEqual([]);
    });
});
