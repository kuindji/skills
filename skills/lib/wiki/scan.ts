import { listRepoFiles } from "../docs/scan";
import type { Diagnostic, Profile } from "../profile/types";
import { validateWikiGraph } from "./graph";
import { isWikiPage, parseWikiPage, slugFor, type WikiPage } from "./page";

export interface WikiScanResult {
    pages: WikiPage[];
    diagnostics: Diagnostic[];
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
        return { pages: [], diagnostics: [] };
    }

    const pages = await loadWikiPages(profile, repoRoot);
    if (pages.length === 0) {
        return {
            pages,
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

    return {
        pages,
        diagnostics: validateWikiGraph(pages, {
            wikiRoot: wiki.root,
            businessSubtree: wiki.businessSubtree,
        }),
    };
}
