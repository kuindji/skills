import { parseFrontmatter } from "../markdown/frontmatter";
import type { Diagnostic, DocClass, Profile } from "../profile/types";
import { loadWikiPages } from "../wiki/scan";
import {
    classifyDocPaths,
    type ClassifyOptions,
    type ClassifyResult,
} from "./classify";
import { isShallowRepository, lastCommitDates } from "./git";
import { type DocFile, validateLifecycleDocs } from "./lifecycle";
import { validateLiveDocs } from "./live";
import { validateTrackerFile } from "./tracker";

/**
 * List the repo's files as git sees them.
 *
 * Tracked files plus untracked ones that are not ignored. A raw directory walk
 * would classify node_modules and build output; asking git means the validator
 * sees exactly what a reviewer would.
 *
 * NUL-separated, because git's default output quotes and octal-escapes any
 * path outside ASCII: a file named `café.md` arrives as the literal
 * `"docs/caf\303\251.md"`, which then fails to open and is reported as
 * unclassified. `-z` turns the quoting off entirely.
 */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
    const proc = Bun.spawn(
        [
            "git",
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(
            `git ls-files failed in ${repoRoot}: ${stderr.trim()}`,
        );
    }
    return stdout.split("\0").filter((path) => path.length > 0);
}

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
    const classified = await scanDocs(profile, repoRoot);
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
