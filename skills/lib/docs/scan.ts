import { parseFrontmatter } from "../markdown/frontmatter";
import type { Diagnostic, DocClass, Profile } from "../profile/types";
import { loadWikiPages } from "../wiki/scan";
import {
    classifyDocPaths,
    type ClassifyOptions,
    type ClassifyResult,
} from "./classify";
import { isShallowRepository, lastCommitDates, listRepoFiles } from "./git";
import { type DocFile, validateLifecycleDocs } from "./lifecycle";
import { validateLiveDocs } from "./live";
import { validateTrackerFile } from "./tracker";

// Re-exported because `listRepoFiles` reads as a docs-scanning concern from
// the outside, and lives in `git.ts` only so the freeze writer can reach it
// without importing the validator that imports the freeze hash.
export { listRepoFiles };

/** Classify every doc in a repo on disk. */
export async function scanDocs(
    profile: Profile,
    repoRoot: string,
    options: ClassifyOptions = { reportDeadGlobs: true },
): Promise<ClassifyResult> {
    const paths = await listRepoFiles(repoRoot);
    return classifyDocPaths(profile, paths, options);
}

export interface ValidateDocsOptions {
    /**
     * Wiki slugs a `folded_into` entry may resolve to. Loaded from the
     * profile's wiki root when not supplied, so the check works on its own as
     * well as under the umbrella validator.
     */
    wikiSlugs?: Set<string>;
    /** Injectable so staleness has a fixed today in tests. */
    now?: Date;
    /**
     * Paths a more specific profile has already classified, so this one does
     * not report them as belonging to no class.
     */
    claimed?: Set<string>;
}

export interface DocsValidateResult extends ClassifyResult {
    /** The lifecycle documents that were read, for a caller that reports counts. */
    lifecycle: DocFile[];
}

/**
 * Classify a repo's docs and check the ones under lifecycle control.
 *
 * Classification comes first and is not optional: a document that matches no
 * class escapes naming, the fold gate and staleness together, which is exactly
 * the file the class system exists to catch. A stray dated plan landing outside
 * the declared globs is invisible to every rule below.
 */
export async function validateDocs(
    profile: Profile,
    repoRoot: string,
    options: ValidateDocsOptions = {},
): Promise<DocsValidateResult> {
    const classified = await scanDocs(profile, repoRoot, {
        reportDeadGlobs: true,
        claimed: options.claimed,
    });
    const diagnostics: Diagnostic[] = [ ...classified.diagnostics ];
    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    const now = options.now ?? new Date();

    const pathsIn = (wanted: DocClass) =>
        classified.files
            .filter((file) => file.docClass === wanted)
            .map((file) => file.path);
    const lifecyclePaths = pathsIn("lifecycle");
    const livePaths = pathsIn("live");
    const trackerPaths = pathsIn("tracker");

    // The tracker's rules are about the shape of one markdown file and need
    // no repository, so they run whether or not anything else here can.
    for (const path of trackerPaths) {
        diagnostics.push(
            ...validateTrackerFile(
                path,
                await Bun.file(`${base}${path}`).text(),
            ),
        );
    }

    // Age is the one input here that cannot be answered from the files alone.
    // Both classes that use it are asking git the same question, so it is
    // asked once, and only when something is going to read the answer.
    const agedPaths = lifecyclePaths.length + livePaths.length;
    const commitDates = agedPaths > 0
        ? await lastCommitDates(repoRoot)
        : new Map<string, string>();
    if (agedPaths > 0 && await isShallowRepository(repoRoot)) {
        diagnostics.push({
            file: profile.sourcePath,
            keyPath: "docs.stale_after_days",
            rule: "docs.shallowClone",
            message:
                "This is a shallow clone, so commit dates are truncated and "
                + "document staleness and review age cannot be measured.",
            remedy: "Fetch the full history where this runs. A CI checkout "
                + "defaults to a depth of one, which makes every document look "
                + "as though it was last touched at the boundary commit.",
            severity: "warning",
        });
    }

    diagnostics.push(...validateLiveDocs(livePaths, {
        reviewAfterDays: profile.docs?.reviewAfterDays ?? 90,
        commitDates,
        now,
    }));

    if (lifecyclePaths.length === 0) {
        return { ...classified, diagnostics, lifecycle: [] };
    }

    const lifecycle: DocFile[] = await Promise.all(
        lifecyclePaths.map(async (path) => ({
            path,
            frontmatter: parseFrontmatter(
                await Bun.file(`${base}${path}`).text(),
            ),
        })),
    );

    const wikiSlugs = options.wikiSlugs
        ?? new Set(
            (await loadWikiPages(profile, repoRoot)).map((page) => page.slug),
        );

    diagnostics.push(...validateLifecycleDocs(lifecycle, {
        staleAfterDays: profile.docs?.staleAfterDays ?? 30,
        wikiSlugs,
        commitDates,
        now,
    }));

    return { ...classified, diagnostics, lifecycle };
}
