import { basename, dirname } from "node:path";
import { listRepoFiles } from "../docs/git";
import { buildProductIndex, type ProductIndex } from "./index";
import { looksLikeRepositoryRoot, parseProfile } from "./parse";
import type { Diagnostic, Profile } from "./types";

/** The filename every profile has, at the root and per product alike. */
export const PROFILE_FILENAME = "project-profile.yaml";

export interface LoadedProfiles {
    /** Absent when the repository has no readable root profile. */
    index?: ProductIndex;
    diagnostics: Diagnostic[];
    /**
     * Directories holding a repository of their own, skipped along with
     * everything under them. Reported so a run can say what it did not read.
     */
    boundaries: string[];
}

/**
 * Read every profile that configures this repository.
 *
 * Resolution is by glob rather than by directory ancestry, because a product
 * owns disjoint subtrees — an app, some packages and a docs folder — and no
 * single directory sits above them. So the profiles are found by filename and
 * the path-to-product index is built from what they claim.
 *
 * The hazard that finding comes with is other people's profiles. Measured
 * against this repo, a plain search finds four: one real profile and three
 * fixture repositories under `skills/lib/fixtures/`, two of which configure a
 * wiki and an owners block for a repository that is not this one. Read as
 * product profiles they would claim `apps/quiz` and `packages/notes-*`, paths
 * that do not exist here, and the validator would fail its own repository over
 * files that are test data. A nested profile declaring repo-wide settings and
 * naming no product is therefore treated as a boundary: it configures a
 * repository, so this one stops at it and at everything beneath it.
 */
export async function loadProfiles(
    repoRoot: string,
): Promise<LoadedProfiles> {
    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    const diagnostics: Diagnostic[] = [];

    const rootPath = `${base}${PROFILE_FILENAME}`;
    const rootFile = Bun.file(rootPath);
    if (!await rootFile.exists()) {
        return {
            diagnostics: [ {
                file: PROFILE_FILENAME,
                keyPath: "",
                rule: "profile.missing",
                message:
                    `This repository has no ${PROFILE_FILENAME} at its root.`,
                remedy: "Copy the template from `skills/templates/"
                    + `${PROFILE_FILENAME}` + "` and fill it in. Every rule "
                    + "these validators enforce is configured there, so "
                    + "without it there is nothing to check against.",
                severity: "error",
            } ],
            boundaries: [],
        };
    }

    const rootResult = parseProfile(await rootFile.text(), PROFILE_FILENAME);
    diagnostics.push(...rootResult.diagnostics);
    const root = rootResult.profile;
    if (!root) {
        return { diagnostics, boundaries: [] };
    }

    const { paths, boundaries } = await discover(repoRoot, diagnostics);
    const products: Profile[] = [];
    for (const path of paths) {
        const result = parseProfile(
            await Bun.file(`${base}${path}`).text(),
            path,
            {
                kind: "product",
                // Repo-wide settings reach a product from here, because this
                // is the only place that has both profiles. Left to its own
                // parse, a product under a Linear tracker read as `in-repo`,
                // which is the default rather than an answer.
                inherit: { trackerBackend: root.tracker.backend },
            },
        );
        diagnostics.push(...result.diagnostics);
        if (result.profile) {
            products.push(result.profile);
        }
    }

    const index = buildProductIndex(root, products);
    diagnostics.push(...index.diagnostics);
    return { index, diagnostics, boundaries };
}

interface Discovery {
    /** Repo-relative product profile paths, shallowest first. */
    paths: string[];
    boundaries: string[];
}

async function discover(
    repoRoot: string,
    diagnostics: Diagnostic[],
): Promise<Discovery> {
    let files: string[];
    try {
        files = await listRepoFiles(repoRoot);
    }
    catch {
        // Outside a repository there is nothing to walk, so the root profile
        // is the whole configuration. Said out loud, because several rules
        // below this one measure age from commits and will find nothing.
        diagnostics.push({
            file: PROFILE_FILENAME,
            keyPath: "",
            rule: "profile.notARepository",
            message: "This directory is not a git repository, so only the root "
                + "profile was read and nothing that depends on history can "
                + "be measured.",
            remedy: "Run this inside the repository the profile describes. A "
                + "product profile, document staleness and the write guard all "
                + "read from git.",
            severity: "warning",
        });
        return { paths: [], boundaries: [] };
    }

    const candidates = files
        .filter((path) => basename(path) === PROFILE_FILENAME)
        .filter((path) => path !== PROFILE_FILENAME)
        // Shallowest first, so a boundary is known before anything beneath it
        // is considered.
        .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));

    const paths: string[] = [];
    const boundaries: string[] = [];
    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    for (const path of candidates) {
        const directory = dirname(path);
        if (
            boundaries.some((edge) =>
                directory === edge || directory.startsWith(`${edge}/`)
            )
        ) {
            continue;
        }
        if (looksLikeRepositoryRoot(await Bun.file(`${base}${path}`).text())) {
            boundaries.push(directory);
            continue;
        }
        paths.push(path);
    }
    return { paths, boundaries };
}

function depth(path: string): number {
    return path.split("/").length;
}
