import type { Diagnostic } from "../profile/types";
import { bodyLinks, FRONTMATTER_KEYS, type WikiPage, wordCount } from "./page";

/**
 * The graph rules, carried over from the validator TheFloorr's wiki has run
 * under since it was written.
 *
 * They exist because a wiki is only navigable if its edges are real. Prose
 * that mentions a related page is not an edge: nothing can walk it, nothing
 * notices when the page moves, and an agent reading one page has no way to
 * find the other. So every relation is declared in frontmatter, declared from
 * both ends, and required to resolve.
 */

/** Body words above which a page is flagged, and above which it fails. */
export const WARN_WORDS = 700;
export const MAX_WORDS = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_SLUG = "README";

export interface GraphRules {
    /**
     * Repo-relative wiki root, used to name a README that is not there. A
     * diagnostic has to point at the file the reader must create, and the one
     * missing page is the one page whose path cannot be read off a page.
     */
    wikiRoot?: string;
    /**
     * A subtree that ships on its own and so may not link outward.
     * Wiki-root-relative slug prefix, or absent when the wiki has no such
     * subtree.
     */
    businessSubtree?: string;
}

/**
 * Check the page graph.
 *
 * Pure: takes parsed pages rather than a directory, so every rule is testable
 * against a handful of literals instead of a fixture tree.
 */
export function validateWikiGraph(
    pages: WikiPage[],
    rules: GraphRules = {},
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const bySlug = new Map<string, WikiPage>();
    for (const page of pages) {
        bySlug.set(page.slug, page);
    }

    // Frontmatter is checked for every page before any edge is walked, because
    // symmetry is a claim about two pages. A page whose `parents` key is a
    // number already has its own diagnostic, and reading its edges as empty
    // would report a second one against whichever healthy page names it.
    const wellFormed = new Set<string>();
    for (const page of pages) {
        if (checkFrontmatter(page, diagnostics)) {
            wellFormed.add(page.slug);
        }
    }

    for (const page of pages) {
        if (!wellFormed.has(page.slug)) {
            continue;
        }
        checkEdges(page, bySlug, wellFormed, diagnostics);
        checkSubtree(page, rules, diagnostics);
        checkSize(page, diagnostics);
    }

    checkReachability(pages, bySlug, wellFormed, rules, diagnostics);

    return diagnostics;
}

/**
 * The frontmatter contract: exactly five keys, each of a fixed shape.
 *
 * Returns whether the graph fields are usable. The closed key set is the half
 * that needs defending: an open one accumulates tags, summaries and scores
 * that duplicate the body, go stale separately from it, and give a reader a
 * second, quieter version of the page to disagree with.
 */
function checkFrontmatter(page: WikiPage, out: Diagnostic[]): boolean {
    const file = page.path;
    const fm = page.frontmatter;
    const at = (key: string) => page.frontmatterLines[key];

    let usable = true;

    const title = fm["title"];
    if (typeof title !== "string" || title.trim() === "") {
        out.push({
            file,
            keyPath: "title",
            line: at("title"),
            rule: "wiki.frontmatterShape",
            message: "`title` is missing or empty.",
            remedy:
                "Add `title:` with the page's human-readable name. It is what "
                + "a reader sees in an index and a search result, where the "
                + "slug alone is not enough to choose by.",
            severity: "error",
        });
        usable = false;
    }

    for (const key of [ "parents", "children", "related_pages" ] as const) {
        const value = fm[key];
        if (!isStringArray(value)) {
            out.push({
                file,
                keyPath: key,
                line: at(key),
                rule: "wiki.frontmatterShape",
                message: `\`${key}\` must be a list of slugs, present even `
                    + "when empty.",
                remedy:
                    `Write \`${key}: []\` when there are none. An absent key `
                    + "and an empty list read the same to a person and differ "
                    + "to every tool that walks the graph.",
                severity: "error",
            });
            usable = false;
        }
    }

    const lastUpdated = fm["last_updated"];
    if (typeof lastUpdated !== "string" || !ISO_DATE.test(lastUpdated)) {
        out.push({
            file,
            keyPath: "last_updated",
            line: at("last_updated"),
            rule: "wiki.lastUpdated",
            message: "`last_updated` must be a YYYY-MM-DD date, and is "
                + `\`${describe(lastUpdated)}\`.`,
            remedy: "Set it to the date of this edit. Housekeeping compares it "
                + "against the age of the code a page describes, which needs a "
                + "date it can subtract, not a phrase.",
            severity: "error",
        });
    }

    for (const key of Object.keys(fm)) {
        if ((FRONTMATTER_KEYS as readonly string[]).includes(key)) {
            continue;
        }
        out.push({
            file,
            keyPath: key,
            line: at(key),
            rule: "wiki.frontmatterKey",
            message: `\`${key}\` is not part of the frontmatter contract.`,
            remedy: "Remove it, or put what it carried in the body. The "
                + `contract is exactly ${FRONTMATTER_KEYS.join(", ")}; a `
                + "sixth key becomes a second, quieter copy of the page that "
                + "goes stale on its own.",
            severity: "error",
        });
    }

    return usable;
}

/**
 * Edges resolve, are declared from both ends, and mirror the directory tree.
 *
 * Bidirectionality is what makes the graph walkable backwards: a page can be
 * read on its own and still say what it belongs to. One-sided edges make a
 * page reachable going down and invisible coming up.
 */
function checkEdges(
    page: WikiPage,
    bySlug: Map<string, WikiPage>,
    wellFormed: Set<string>,
    out: Diagnostic[],
): void {
    const file = page.path;
    const at = (key: string) => page.frontmatterLines[key];
    const parents = list(page.frontmatter["parents"]);
    const children = list(page.frontmatter["children"]);
    const related = list(page.frontmatter["related_pages"]);

    if (page.slug === ROOT_SLUG && parents.length > 0) {
        out.push({
            file,
            keyPath: "parents",
            line: at("parents"),
            rule: "wiki.rootHasParents",
            message: "The wiki README is the root and must have no parents.",
            remedy: "Set `parents: []`. Reachability is measured from this "
                + "page, so a parent above it would sit outside the graph.",
            severity: "error",
        });
    }
    else if (page.slug !== ROOT_SLUG && parents.length === 0) {
        out.push({
            file,
            keyPath: "parents",
            line: at("parents"),
            rule: "wiki.orphan",
            message: "The page declares no parents.",
            remedy: "List the index page this one belongs under, and add this "
                + "slug to that page's `children`. A page nothing owns is "
                + "found only by someone who already knows it exists.",
            severity: "error",
        });
    }

    for (const parent of parents) {
        const target = bySlug.get(parent);
        if (!target) {
            out.push(unresolved(page, "parents", parent, "parent"));
            continue;
        }
        if (
            wellFormed.has(parent)
            && !list(target.frontmatter["children"]).includes(page.slug)
        ) {
            out.push({
                file,
                keyPath: "parents",
                line: at("parents"),
                rule: "wiki.asymmetricParentChild",
                message: `\`${parent}\` is named as a parent but does not `
                    + `list \`${page.slug}\` in its \`children\`.`,
                remedy:
                    `Add \`${page.slug}\` to \`children\` in ${target.path}. `
                    + "Both ends declare the edge, so the parent index stays "
                    + "an accurate list of what it covers.",
                severity: "error",
            });
        }
    }

    for (const child of children) {
        const target = bySlug.get(child);
        if (!target) {
            out.push(unresolved(page, "children", child, "child"));
        }
        else if (
            wellFormed.has(child)
            && !list(target.frontmatter["parents"]).includes(page.slug)
        ) {
            out.push({
                file,
                keyPath: "children",
                line: at("children"),
                rule: "wiki.asymmetricParentChild",
                message: `\`${child}\` is named as a child but does not list `
                    + `\`${page.slug}\` in its \`parents\`.`,
                remedy:
                    `Add \`${page.slug}\` to \`parents\` in ${target.path}.`,
                severity: "error",
            });
        }

        // The tree on disk mirrors the graph, which is what makes the split
        // rule mechanical: a section that outgrows its host moves to
        // `<parent>/<topic>.md` and the edge follows the file.
        const nested = page.slug === ROOT_SLUG
            ? !child.includes("/")
            : child.startsWith(`${page.slug}/`);
        if (!nested) {
            out.push({
                file,
                keyPath: "children",
                line: at("children"),
                rule: "wiki.childNotUnderParent",
                message: page.slug === ROOT_SLUG
                    ? `\`${child}\` is a child of the README, so it must be a `
                        + "top-level page."
                    : `\`${child}\` is a child of \`${page.slug}\` but does `
                        + `not live under \`${page.slug}/\`.`,
                remedy: page.slug === ROOT_SLUG
                    ? `Move it to \`${child.split("/").pop()}.md\` at the wiki `
                        + "root, or make it a child of the page it sits under."
                    : `Move the file to \`${page.slug}/\`, or give it the `
                        + "parent whose directory it is already in. The "
                        + "directory tree and the graph are one structure.",
                severity: "error",
            });
        }
    }

    for (const peer of related) {
        const target = bySlug.get(peer);
        if (!target) {
            out.push(unresolved(page, "related_pages", peer, "related page"));
        }
        else if (
            wellFormed.has(peer)
            && !list(target.frontmatter["related_pages"]).includes(page.slug)
        ) {
            out.push({
                file,
                keyPath: "related_pages",
                line: at("related_pages"),
                rule: "wiki.asymmetricRelated",
                message: `\`${peer}\` is listed as related but does not list `
                    + `\`${page.slug}\` back.`,
                remedy: `Add \`${page.slug}\` to \`related_pages\` in `
                    + `${target.path}, or drop the edge here. Relatedness that `
                    + "only one side knows about is invisible to a reader who "
                    + "arrives at the other page.",
                severity: "error",
            });
        }
    }

    for (const link of bodyLinks(page)) {
        if (!bySlug.has(link.target)) {
            out.push({
                file,
                keyPath: "",
                line: link.line,
                rule: "wiki.brokenLink",
                message: `\`[[${link.target}]]\` does not resolve to a page.`,
                remedy:
                    "Correct the slug, or write the sentence without a link. "
                    + "Slugs are wiki-root-relative and carry no `.md`, so a "
                    + "page at `services/orders.md` is `[[services/orders]]`.",
                severity: "error",
            });
        }
    }
}

/**
 * A declared subtree may not link out of itself.
 *
 * The subtree is shipped somewhere the rest of the wiki is not, so an edge
 * leaving it resolves here and is dead there. The one legal boundary edge is
 * the subtree index naming the README as its parent.
 */
function checkSubtree(
    page: WikiPage,
    rules: GraphRules,
    out: Diagnostic[],
): void {
    // Normalised once, here, rather than defended at each comparison below.
    // A `business/` written by hand reads correctly to a person and matches
    // nothing as a prefix, which would switch this whole rule off in silence.
    const subtree = rules.businessSubtree?.replace(/\/+$/, "");
    if (
        subtree === undefined || subtree === ""
        || !inSubtree(page.slug, subtree)
    ) {
        return;
    }

    const edges: { target: string; keyPath: string; line?: number; }[] = [];
    for (const key of [ "parents", "children", "related_pages" ] as const) {
        for (const target of list(page.frontmatter[key])) {
            edges.push({
                target,
                keyPath: key,
                line: page.frontmatterLines[key],
            });
        }
    }
    for (const link of bodyLinks(page)) {
        edges.push({ target: link.target, keyPath: "", line: link.line });
    }

    for (const edge of edges) {
        const allowed = inSubtree(edge.target, subtree)
            || (page.slug === subtree && edge.target === ROOT_SLUG);
        if (allowed) {
            continue;
        }
        out.push({
            file: page.path,
            keyPath: edge.keyPath,
            line: edge.line,
            rule: "wiki.subtreeLeak",
            message: `The edge to \`${edge.target}\` leaves the `
                + `\`${subtree}/\` subtree.`,
            remedy: `\`${subtree}/\` ships on its own, so this link is dead `
                + "wherever it ships. Move what the reader needs into the "
                + "subtree, or say it in prose without linking.",
            severity: "error",
        });
    }
}

/**
 * The size budget, and the reason it is two thresholds.
 *
 * A page over budget is a page that answers more than one question, and the
 * remedy is to split it rather than to compress it. The warning gives that
 * move a chance to happen while it is still cheap; the error is where a page
 * has stopped being one page.
 */
function checkSize(page: WikiPage, out: Diagnostic[]): void {
    const words = wordCount(page);
    if (words <= WARN_WORDS) {
        return;
    }
    const overBudget = words > MAX_WORDS;
    out.push({
        file: page.path,
        keyPath: "",
        line: page.bodyStartLine,
        rule: "wiki.sizeBudget",
        message: `The body is ${words} words, over the `
            + `${overBudget ? MAX_WORDS : WARN_WORDS}-word `
            + `${overBudget ? "limit" : "target"}.`,
        remedy:
            "Split it: move each independent section to its own page under a "
            + "directory named after this slug, turn this page into an index "
            + "of one bullet per child, and update `parents` and `children` on "
            + "everything touched. Do not trim it instead. Trimming keeps the "
            + "same number of subjects and removes the detail that made them "
            + "worth writing down.",
        severity: overBudget ? "error" : "warning",
    });
}

/**
 * Every page is reachable from the README by walking children and body links.
 *
 * A page nothing points at is a page nobody finds, which is the same as not
 * having written it, except that it still goes stale and still contradicts
 * whatever replaced it.
 */
function checkReachability(
    pages: WikiPage[],
    bySlug: Map<string, WikiPage>,
    wellFormed: Set<string>,
    rules: GraphRules,
    out: Diagnostic[],
): void {
    const readme = bySlug.get(ROOT_SLUG);
    if (!readme) {
        if (pages.length === 0) {
            return;
        }
        const root = rules.wikiRoot;
        out.push({
            file: root === undefined
                ? "README.md"
                : `${root.replace(/\/+$/, "")}/README.md`,
            keyPath: "",
            rule: "wiki.noReadme",
            message: "The wiki has no README.md at its root.",
            remedy:
                "Add one. It is the entry point every other page is measured "
                + "as reachable from, and the page an agent opens when it "
                + "knows nothing about the project yet.",
            severity: "error",
        });
        return;
    }

    // The walk starts at the README's own edges. If those are malformed, the
    // README already carries the diagnostic that has to be fixed first, and
    // reading them as empty would report every other page in the wiki as
    // unreachable: one typo, one error per page.
    if (!wellFormed.has(ROOT_SLUG)) {
        return;
    }

    const seen = new Set([ ROOT_SLUG ]);
    const queue = [ ROOT_SLUG ];
    while (queue.length > 0) {
        const page = bySlug.get(queue.shift()!)!;
        const next = [
            ...list(page.frontmatter["children"]),
            ...bodyLinks(page).map((link) => link.target),
        ];
        for (const slug of next) {
            if (bySlug.has(slug) && !seen.has(slug)) {
                seen.add(slug);
                queue.push(slug);
            }
        }
    }

    for (const page of pages) {
        if (!seen.has(page.slug)) {
            out.push({
                file: page.path,
                keyPath: "",
                rule: "wiki.unreachable",
                message: "The page is not reachable from the wiki README by "
                    + "following `children` and body links.",
                remedy:
                    "Link it from the index it belongs under, in that page's "
                    + "`children` and in its prose. Declaring a parent here is "
                    + "not enough on its own: the walk goes downward.",
                severity: "error",
            });
        }
    }

    // A top-level page missing from the README is reachable only if some other
    // page happens to link it, which makes the front door an incomplete map of
    // the wiki while still looking like a complete one.
    const listed = new Set(list(readme.frontmatter["children"]));
    for (const page of pages) {
        if (
            page.slug === ROOT_SLUG || page.slug.includes("/")
            || listed.has(page.slug)
        ) {
            continue;
        }
        out.push({
            file: readme.path,
            keyPath: "children",
            line: readme.frontmatterLines["children"],
            rule: "wiki.readmeMissingTopLevel",
            message: `The top-level page \`${page.slug}\` is not in the `
                + "README's `children`.",
            remedy: `Add \`${page.slug}\` to \`children\` and describe it in `
                + "the README body. The README is the map of the wiki, and a "
                + "section missing from it is a section nobody knows to ask "
                + "for.",
            severity: "error",
        });
    }
}

function unresolved(
    page: WikiPage,
    keyPath: "parents" | "children" | "related_pages",
    target: string,
    label: string,
): Diagnostic {
    const rule = keyPath === "parents"
        ? "wiki.missingParent"
        : keyPath === "children"
        ? "wiki.missingChild"
        : "wiki.missingRelated";
    return {
        file: page.path,
        keyPath,
        line: page.frontmatterLines[keyPath],
        rule,
        message: `The ${label} \`${target}\` does not resolve to a page.`,
        remedy:
            "Correct the slug or remove the edge. A slug is the file's path "
            + "under the wiki root without `.md`, so `services/orders.md` is "
            + "`services/orders`.",
        severity: "error",
    };
}

/** Whether a slug is the subtree root or sits under it. */
function inSubtree(slug: string, subtree: string): boolean {
    return slug === subtree || slug.startsWith(`${subtree}/`);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value)
        && value.every((item) => typeof item === "string");
}

/**
 * Read another page's edge list.
 *
 * Deliberately lenient: this reads a field the current page does not own, and
 * a malformed sibling is that sibling's diagnostic. Failing here would report
 * one broken page as a fault in every page that names it.
 */
function list(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function describe(value: unknown): string {
    return value === undefined ? "absent" : String(value);
}
