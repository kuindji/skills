import { listRepoFiles } from "../docs/scan";
import type { Diagnostic, Profile } from "../profile/types";
import { validateWikiGraph } from "./graph";
import { isWikiPage, parseWikiPage, slugFor, type WikiPage } from "./page";
import { validateWikiProse } from "./prose";

export interface WikiScanResult {
    pages: WikiPage[];
    diagnostics: Diagnostic[];
    /**
     * File-path references found, reported under either policy.
     *
     * Not a diagnostic, because under `citation` it is not a fault. It is the
     * inventory: a project that has sanctioned path citations still has a
     * right to know it is carrying 1107 of them across 107 pages, which is how
     * the practice is judged rather than assumed.
     */
    pathCitations: number;
    /** Pages carrying at least one path reference. */
    pagesWithPathCitations: number;
}

/** Read every page under the profile's wiki root. */
export async function loadWikiPages(
    profile: Profile,
    repoRoot: string,
): Promise<WikiPage[]> {
    const root = profile.wiki?.root;
    if (!root) {
        return [];
    }
    const prefix = root.endsWith("/") ? root : `${root}/`;
    const paths = (await listRepoFiles(repoRoot))
        .filter((path) => path.startsWith(prefix))
        .filter((path) => isWikiPage(path.slice(prefix.length)));

    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    return Promise.all(paths.map(async (path) => {
        const source = await Bun.file(`${base}${path}`).text();
        return parseWikiPage(source, slugFor(path.slice(prefix.length)), path);
    }));
}

/**
 * Validate a repository's wiki.
 *
 * A declared root holding no pages is a warning rather than an error, so a
 * repo can commit its intent to have a wiki before it has written one. Making
 * that an error would mean the first honest configuration a new project writes
 * fails its own validator, which teaches the project to stop running it.
 */
export async function validateWiki(
    profile: Profile,
    repoRoot: string,
): Promise<WikiScanResult> {
    const wiki = profile.wiki;
    if (!wiki) {
        return {
            pages: [],
            diagnostics: [],
            pathCitations: 0,
            pagesWithPathCitations: 0,
        };
    }

    const pages = await loadWikiPages(profile, repoRoot);
    if (pages.length === 0) {
        return {
            pages,
            pathCitations: 0,
            pagesWithPathCitations: 0,
            diagnostics: [ {
                file: profile.sourcePath,
                keyPath: "wiki.root",
                rule: "wiki.empty",
                message: `The declared wiki root \`${wiki.root}\` holds no `
                    + "pages.",
                remedy:
                    "Write its README.md when there is something to describe, "
                    + "or drop the `wiki` block until then. Nothing else here "
                    + "is checked while it is empty.",
                severity: "warning",
            } ],
        };
    }

    const prose = validateWikiProse(pages, {
        pathCitations: wiki.pathCitations,
    });
    return {
        pages,
        diagnostics: [
            ...validateWikiGraph(pages, {
                wikiRoot: wiki.root,
                businessSubtree: wiki.businessSubtree,
            }),
            ...prose.diagnostics,
        ],
        pathCitations: prose.pathCitations,
        pagesWithPathCitations: prose.pagesWithPathCitations,
    };
}
