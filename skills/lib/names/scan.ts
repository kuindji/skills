import {
    isShallowRepository,
    lastCommitDates,
    listRepoFiles,
} from "../docs/git";
import { claims } from "../profile/paths";
import type { Profile } from "../profile/types";
import { loadWikiPages } from "../wiki/scan";
import {
    buildWorklist,
    type DriftPage,
    type DriftWorklist,
    type NameIndex,
} from "./drift";
import { extractNames } from "./extract";

/**
 * Reading a repository into a drift worklist.
 *
 * The rules are in `drift.ts` and are pure. This is the half that touches the
 * world: which files are worth searching, what tokens they hold, and when git
 * last saw each of them.
 */

/** The default age at which an untraceable page is surfaced on age alone. */
export const DEFAULT_AGE_DAYS = 90;

/**
 * Past this, a file is not prose or source and searching it costs more than
 * it returns. A minified bundle is the case: one line, every token in the
 * project, and a commit date that says nothing about any of them.
 */
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Extensions that hold no names, only bytes.
 *
 * A deny list rather than an allow list, because an allow list silently drops
 * whichever language the next repository is written in, and a page about that
 * language's code would come back untraceable with nothing saying why.
 */
const BINARY_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "ico",
    "icns",
    "pdf",
    "zip",
    "gz",
    "tgz",
    "bz2",
    "xz",
    "7z",
    "jar",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "mp3",
    "mp4",
    "mov",
    "avi",
    "webm",
    "wav",
    "ogg",
    "so",
    "dylib",
    "dll",
    "exe",
    "wasm",
    "bin",
    "dat",
    "db",
    "sqlite",
    "keystore",
    "jks",
    "p12",
    "pdb",
    "xcuserstate",
]);

/**
 * Lockfiles, which are a list of every package name in the dependency tree
 * and change on every install. A page naming any dependency would be queued
 * by them forever, on the strength of a file nobody wrote.
 */
const LOCKFILES = new Set([
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
    "Gemfile.lock",
    "Podfile.lock",
    "composer.lock",
    "poetry.lock",
    "uv.lock",
    "go.sum",
]);

/**
 * Identifier-shaped tokens, which is the form a name takes in source.
 *
 * Interior dots are part of the token, because extraction accepts a dotted
 * name and a page writes one: `analytics.rate_table`, `process.env`. A
 * tokeniser that split on the dot would leave such a page permanently
 * untraceable, with the name sitting in the file it was looking at. Only
 * interior ones, so a sentence in a comment does not end its last word with a
 * full stop and stop matching the bare name.
 */
const TOKEN_RE = /[A-Za-z_$][A-Za-z0-9_$-]*(?:\.[A-Za-z_$][A-Za-z0-9_$-]*)*/g;

export interface ScanOptions {
    /** Injected so a test is not measuring the day it runs on. */
    now?: Date;
}

export interface DriftScan extends DriftWorklist {
    /** Wiki pages read. */
    pages: number;
    /** Files searched for names. */
    searched: number;
    /** The age threshold applied, which is where a reader judges the list. */
    ageDays: number;
    /**
     * The history is truncated, so the churn column is not measuring what it
     * says. Everything older than the boundary carries the boundary commit's
     * date, which is recent, so every traced page reports churn. CI checks out
     * at a depth of one by default, which makes this the ordinary case there.
     */
    shallow: boolean;
}

/**
 * Build the worklist for a repository.
 *
 * A repository with no wiki gets an empty worklist rather than an error. That
 * is the ordinary shape of a project that has committed its intent to have a
 * wiki before writing one, and a sweep that fails there teaches the project
 * to stop sweeping.
 */
export async function scanDrift(
    profile: Profile,
    repoRoot: string,
    options: ScanOptions = {},
): Promise<DriftScan> {
    const now = options.now ?? new Date();
    const ageDays = profile.docs?.reviewAfterDays ?? DEFAULT_AGE_DAYS;

    const wikiPages = await loadWikiPages(profile, repoRoot);
    const pages: DriftPage[] = wikiPages.map((page) => ({
        slug: page.slug,
        path: page.path,
        lastUpdated: declaredDate(page.frontmatter.last_updated),
        names: extractNames(page),
    }));

    const candidates = (await listRepoFiles(repoRoot))
        .filter((path) => isCandidate(path, profile));
    const [ index, dates, shallow ] = await Promise.all([
        buildIndex(candidates, repoRoot),
        lastCommitDates(repoRoot),
        isShallowRepository(repoRoot),
    ]);

    return {
        ...buildWorklist({ pages, index, dates, now, ageDays }),
        pages: pages.length,
        searched: index.paths.length,
        ageDays,
        shallow,
    };
}

/**
 * `last_updated` as the page wrote it.
 *
 * A YAML date is parsed into a `Date` by some readers and left a string by
 * others, and the frontmatter parser here is free to change its mind. Both
 * forms are normalised to the day, and anything else is handed on unchanged
 * for the worklist to reject, so a malformed date is reported as untraceable
 * rather than crashing the sweep.
 */
function declaredDate(value: unknown): string | undefined {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? undefined
            : value.toISOString().slice(0, 10);
    }
    return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Whether a file is worth searching for names.
 *
 * The wiki is excluded because a page's names appear in the page, and in
 * every other page about the same subject, so searching it would report that
 * every page is drifting from itself. The docs root is excluded because a
 * spec naming a table is not the table. Generated output is excluded because
 * it moves whenever its generator runs, which would queue a page on every
 * build rather than on a change anyone made.
 */
function isCandidate(path: string, profile: Profile): boolean {
    // An empty root is the repository root, which is how the profile spells a
    // docs-only repository, and it means every path is under it rather than
    // none. Reading it the other way would search every document in such a
    // repository as though it were code, so a spec being edited would read as
    // the code moving under a page.
    const under = (root: string | undefined) =>
        root !== undefined
        && (root === "" || path === root
            || path.startsWith(`${root.replace(/\/$/, "")}/`));

    if (under(profile.wiki?.root) || under(profile.docs?.root)) {
        return false;
    }
    if (profile.generatedPaths.some((pattern) => claims(pattern, path))) {
        return false;
    }
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (LOCKFILES.has(name)) {
        return false;
    }
    const dot = name.lastIndexOf(".");
    const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
    return !BINARY_EXTENSIONS.has(extension);
}

/** Token to the files holding it, built in one pass over the candidates. */
async function buildIndex(
    paths: string[],
    repoRoot: string,
): Promise<NameIndex> {
    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    const tokens = new Map<string, string[]>();
    const searched: string[] = [];

    for (const path of paths) {
        const file = Bun.file(`${base}${path}`);
        if (file.size > MAX_FILE_BYTES) {
            continue;
        }
        let source: string;
        try {
            source = await file.text();
        }
        catch {
            // Unreadable is not a fault of the wiki's. A file git lists and
            // the filesystem will not hand over contributes no names, and
            // saying so would be a diagnostic about the checkout rather than
            // about any page.
            continue;
        }
        searched.push(path);
        for (const token of tokensIn(source)) {
            // Pushed rather than rebuilt. A token carried by every file in a
            // large repository would otherwise copy a growing array once per
            // file, which is the whole index in quadratic time for the tokens
            // that appear most.
            const holders = tokens.get(token);
            if (holders === undefined) {
                tokens.set(token, [ path ]);
            }
            else {
                holders.push(path);
            }
        }
    }

    return { tokens, paths: searched };
}

/**
 * The distinct names a file holds, dotted forms and their segments both.
 *
 * Both, because the two are different names and a page may use either. A page
 * naming `analytics.rate_table` has to match the qualified use, and a page
 * naming `rate_table` has to keep matching it too.
 */
function tokensIn(source: string): Set<string> {
    const found = new Set<string>();
    for (const token of source.match(TOKEN_RE) ?? []) {
        found.add(token);
        if (token.includes(".")) {
            for (const segment of token.split(".")) {
                found.add(segment);
            }
        }
    }
    return found;
}
