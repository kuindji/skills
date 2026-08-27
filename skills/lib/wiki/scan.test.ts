import { describe, expect, test } from "bun:test";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import { loadWikiPages, validateWiki } from "./scan";

const repoRoot = new URL("../../../", import.meta.url).pathname;

/** A profile pointing at a fixture wiki, otherwise minimal. */
function profileFor(wikiRoot: string, subtree?: string): Profile {
    const source = [
        "wiki:",
        `  root: ${wikiRoot}`,
        "  profiles: [technical]",
        ...(subtree === undefined ? [] : [ `  business_subtree: ${subtree}` ]),
        "  path_citations: forbidden",
        "tracker:",
        "  backend: in-repo",
        "  file: docs/tasks.md",
        "mode:",
        "  default: greenfield",
    ].join("\n");
    const { profile, diagnostics } = parseProfile(
        source,
        `${repoRoot}project-profile.yaml`,
    );
    if (!profile) {
        throw new Error(
            `fixture profile did not parse: ${JSON.stringify(diagnostics)}`,
        );
    }
    return profile;
}

const fixtures = "skills/lib/fixtures/wiki";

describe("a wiki that satisfies every rule", () => {
    const profile = profileFor(`${fixtures}/clean`, "business");

    test("validates clean", async () => {
        const { diagnostics } = await validateWiki(profile, repoRoot);
        expect(diagnostics).toEqual([]);
    });

    test("the authoring principles are not loaded as a page", async () => {
        const pages = await loadWikiPages(profile, repoRoot);
        const slugs = pages.map((page) => page.slug).sort();
        expect(slugs).toEqual([
            "README",
            "business",
            "business/orders",
            "services",
            "services/pricing",
        ]);
    });

    test("slugs are wiki-root-relative, and paths are repo-relative", async () => {
        const pages = await loadWikiPages(profile, repoRoot);
        const orders = pages.find((page) => page.slug === "business/orders");
        expect(orders?.path).toBe(`${fixtures}/clean/business/orders.md`);
    });
});

describe("a wiki with real violations", () => {
    const profile = profileFor(`${fixtures}/broken`);

    async function found() {
        const { diagnostics } = await validateWiki(profile, repoRoot);
        return diagnostics;
    }

    test("a child that was never written is caught twice, as edge and link", async () => {
        const rules = (await found())
            .filter((d) => d.message.includes("dear-child"))
            .map((d) => d.rule)
            .sort();
        expect(rules).toEqual([ "wiki.brokenLink", "wiki.missingChild" ]);
    });

    test("a one-sided related edge is caught", async () => {
        const asymmetric = (await found()).find(
            (d) => d.rule === "wiki.asymmetricRelated",
        );
        expect(asymmetric?.file).toBe(`${fixtures}/broken/alpha.md`);
        expect(asymmetric?.line).toBe(5);
    });

    test("a page nothing points at is unreachable", async () => {
        const unreachable = (await found()).find(
            (d) => d.rule === "wiki.unreachable",
        );
        expect(unreachable?.file).toBe(`${fixtures}/broken/beta.md`);
    });

    test("a line number and a tree are caught on disk", async () => {
        const positions = (await found()).filter(
            (d) => d.file.endsWith("positions.md"),
        );
        expect(positions.map((d) => d.rule).sort()).toEqual([
            "wiki.directoryTree",
            "wiki.lineNumber",
            "wiki.snapshot",
        ]);
    });

    test("path references are counted even where the policy allows them", async () => {
        const { pathCitations, pagesWithPathCitations } = await validateWiki(
            profile,
            repoRoot,
        );
        expect(pathCitations).toBe(1);
        expect(pagesWithPathCitations).toBe(1);
    });

    test("every diagnostic names a file and says what to do", async () => {
        for (const diagnostic of await found()) {
            expect(diagnostic.file).not.toBe("");
            expect(diagnostic.remedy.length).toBeGreaterThan(20);
        }
    });
});

describe("a declared wiki that is not written yet", () => {
    test("an empty root is a warning, not an error", async () => {
        const profile = profileFor("docs/wiki");
        const { diagnostics } = await validateWiki(profile, repoRoot);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]!.rule).toBe("wiki.empty");
        expect(diagnostics[0]!.severity).toBe("warning");
    });

    test("a profile with no wiki block says nothing", async () => {
        const { profile } = parseProfile(
            "tracker:\n  backend: linear\nmode:\n  default: mature\n",
            `${repoRoot}project-profile.yaml`,
        );
        const { diagnostics } = await validateWiki(profile!, repoRoot);
        expect(diagnostics).toEqual([]);
    });
});
