import { basename } from "node:path";
import { PROFILE_FILENAME } from "../profile/load";
import {
    type Diagnostic,
    DOC_CLASSES,
    type DocClass,
    type Profile,
} from "../profile/types";

export interface ClassifiedDoc {
    /** Repo-relative path. */
    path: string;
    docClass: DocClass;
}

export interface ClassifyResult {
    files: ClassifiedDoc[];
    diagnostics: Diagnostic[];
}

export interface ClassifyOptions {
    /**
     * Report declared selectors that matched nothing.
     *
     * Only meaningful when the caller passed every file in the repo. A partial
     * list would make most selectors look dead.
     */
    reportDeadGlobs?: boolean;
    /**
     * Paths a more specific profile has already classified.
     *
     * Only meaningful in a multi-product repo, where a product's docs root can
     * sit inside the repository's. Without it the outer profile reports every
     * one of the inner profile's documents as matching no class, which is the
     * opposite of true.
     */
    claimed?: Set<string>;
}

/**
 * Assign every file under the docs root to exactly one declared class.
 *
 * Classes exist because a docs root holds several kinds of document with
 * different obligations: a plan is frozen once shipped, a privacy policy never
 * was under that lifecycle, and a branding asset is not prose at all. Applying
 * one rule to the whole directory is what makes a validator get switched off.
 *
 * Pure: takes the paths rather than reading them, so the rules can be tested
 * without a fixture tree on disk.
 */
export function classifyDocPaths(
    profile: Profile,
    repoRelativePaths: string[],
    options: ClassifyOptions = {},
): ClassifyResult {
    const diagnostics: Diagnostic[] = [];
    const files: ClassifiedDoc[] = [];
    const docs = profile.docs;

    // A repo need not have a docs root. Nothing to classify, nothing to say.
    if (!docs) {
        return { files, diagnostics };
    }

    const file = profile.sourcePath;
    const trackerIsInRepo = profile.tracker.backend === "in-repo";

    // The tracker class only means something when the tracker is a file in
    // this repo. Declaring it against ClickUp suggests the author believed
    // task state lived here, which is the confusion the class exists to avoid.
    if (docs.globs.tracker.length > 0 && !trackerIsInRepo) {
        diagnostics.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerClass",
            message:
                "A `tracker` doc class is declared, but the tracker backend is "
                + `\`${profile.tracker.backend}\`, which holds task state `
                + "outside this repo.",
            remedy:
                "Remove the docs.tracker globs, or change tracker.backend to "
                + `in-repo. With ${profile.tracker.backend}, a file in the repo `
                + "carrying task state would be a second authority.",
            severity: "error",
        });
    }

    // A glob written with a leading slash is repo-root-relative, which is how
    // a file outside the docs tree gets a class. The repo's front door,
    // README.md and AGENTS.md, is a live document by nature but does not live
    // under docs/. Without this it would be silently unvalidated.
    const isRootRelative = (pattern: string) => pattern.startsWith("/");
    const matchedGlobs = new Set<string>();
    const classify = (relative: string, rootRelative: string) => {
        return DOC_CLASSES.filter((docClass) =>
            docs.globs[docClass].some((pattern) => {
                const subject = isRootRelative(pattern)
                    ? rootRelative
                    : relative;
                const target = isRootRelative(pattern)
                    ? pattern.slice(1)
                    : pattern;
                if (subject === undefined) {
                    return false;
                }
                const hit = new Bun.Glob(target).match(subject);
                if (hit) {
                    matchedGlobs.add(`${docClass}:${pattern}`);
                }
                return hit;
            })
        );
    };

    // An empty root is the repository root, so every path is under it. Left
    // to `withTrailingSlash` it would be `/`, which no repo-relative path
    // starts with, and the profile would classify nothing.
    const docsPrefix = docs.root === "" ? "" : withTrailingSlash(docs.root);
    // The wiki has its own validator and its own rules. When it sits inside
    // the docs root, as it usually does, classifying its pages would demand a
    // doc class for every wiki page.
    const wikiPrefix = profile.wiki?.root
        ? withTrailingSlash(profile.wiki.root)
        : undefined;

    // Files outside the docs root are classified only when a root-relative
    // glob names them. They are never swept for "matches no class": that rule
    // governs the docs tree, and applying it repo-wide would demand a class
    // for every source file.
    for (const path of repoRelativePaths) {
        if (!path.startsWith(docsPrefix)) {
            const matched = classify("", path);
            if (matched.length === 1) {
                files.push({ path, docClass: matched[0]! });
                // The tracker checks belong to the path, not to where it
                // sits. A repo whose tracker is a root TODO.md reaches it
                // through a root-relative glob and would otherwise get none
                // of them.
                checkTrackerPlacement(
                    profile,
                    path,
                    matched[0]!,
                    diagnostics,
                );
            }
            else if (matched.length > 1) {
                diagnostics.push({
                    file,
                    keyPath: "docs",
                    rule: "docs.ambiguous",
                    message: `\`${path}\` matches more than one doc class: `
                        + `${matched.join(", ")}.`,
                    remedy: "Narrow the globs so exactly one class claims it.",
                    severity: "error",
                });
            }
            continue;
        }
        if (wikiPrefix !== undefined && path.startsWith(wikiPrefix)) {
            continue;
        }
        // A profile is configuration, not a document, and the spec puts each
        // product's profile at that product's docs root — which is exactly
        // where this rule would otherwise demand a doc class for it. The
        // recommended layout must not be the one that fails.
        if (basename(path) === PROFILE_FILENAME) {
            continue;
        }
        // Claimed by a profile closer to the file: in a multi-product repo a
        // product's docs root sits inside the repository's, and the file has
        // a class — just not from here.
        if (options.claimed?.has(path)) {
            continue;
        }

        const relative = path.slice(docsPrefix.length);
        const matched = classify(relative, path);

        if (matched.length === 0) {
            diagnostics.push({
                file,
                keyPath: "docs",
                rule: "docs.unclassified",
                message: `\`${path}\` matches no declared doc class.`,
                remedy: "Add a glob for it under one of: "
                    + `${DOC_CLASSES.join(", ")}. Use \`ignored\` if it is `
                    + "deliberately outside the rules, so the exclusion is "
                    + "visible rather than silent.",
                severity: "error",
            });
            continue;
        }

        if (matched.length > 1) {
            diagnostics.push({
                file,
                keyPath: "docs",
                rule: "docs.ambiguous",
                message: `\`${path}\` matches more than one doc class: `
                    + `${matched.join(", ")}.`,
                remedy: "Narrow the globs so exactly one class claims it. Two "
                    + "classes mean two sets of obligations, and nothing "
                    + "decides which applies.",
                severity: "error",
            });
            continue;
        }

        const docClass = matched[0]!;
        files.push({ path, docClass });
        checkTrackerPlacement(profile, path, docClass, diagnostics);
    }

    // A selector that matches nothing looks like coverage and provides none.
    // An exact path is a broken promise about one document, so it is an error.
    // A wildcard names a family that may legitimately be empty, so it remains
    // a warning. This repo once shipped `live: ["README.md"]`, which resolved
    // under the docs root and matched no file while reading as though the
    // repository front door were covered.
    if (options.reportDeadGlobs) {
        for (const docClass of DOC_CLASSES) {
            for (const pattern of docs.globs[docClass]) {
                if (matchedGlobs.has(`${docClass}:${pattern}`)) {
                    continue;
                }
                const wildcard = hasGlobSyntax(pattern);
                diagnostics.push({
                    file,
                    keyPath: `docs.${docClass}`,
                    rule: "docs.deadGlob",
                    message: wildcard
                        ? `The \`${docClass}\` glob \`${pattern}\` matches no `
                            + "file."
                        : `The \`${docClass}\` path \`${pattern}\` names no file.`,
                    remedy:
                        "Remove it, or correct it. Selectors resolve relative to "
                        + `the docs root (${describeRoot(docs.root)}); prefix `
                        + "with `/` to match from the repo root instead.",
                    severity: wildcard ? "warning" : "error",
                });
            }
        }
    }

    return { files, diagnostics };
}

/** Whether a document selector uses Bun.Glob syntax rather than one path. */
function hasGlobSyntax(pattern: string): boolean {
    const target = pattern.startsWith("/") ? pattern.slice(1) : pattern;
    for (let index = 0; index < target.length; index++) {
        const character = target[index];
        if (character === "\\") {
            // Bun treats the next character literally, including glob syntax.
            index++;
            continue;
        }
        if (
            character === "*" || character === "?" || character === "["
            || character === "{" || (character === "!" && index === 0)
        ) {
            return true;
        }
    }
    return false;
}

/**
 * The docs root as a reader should see it named.
 *
 * An empty root is the repository root, and printed as an empty pair of
 * backticks it reads as a missing value rather than as the answer.
 */
function describeRoot(root: string): string {
    return root === "" ? "the repository root" : `\`${root}\``;
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}

/**
 * Something classifies the tracker file as `tracker`.
 *
 * Every rule that makes an in-repo tracker trustworthy runs over files in that
 * class, so a tracker no glob claims is a file none of them ever see. The
 * repository can declare the backend, name the file, write it, and have the
 * one rule the whole class exists for, that Done carries evidence, silently
 * not run. Nothing else reports it: outside a docs root the file is not swept
 * for a class at all, and inside one it draws `docs.unclassified`, which reads
 * as a filing question rather than as the tracker being unchecked.
 *
 * Takes what every profile classified rather than one profile's result,
 * because the tracker is repo-wide and the profile that claims it may be a
 * product's.
 */
export function checkTrackerCovered(
    root: Profile,
    classified: ClassifiedDoc[],
): Diagnostic[] {
    const path = root.tracker.file;
    if (root.tracker.backend !== "in-repo" || path === undefined) {
        return [];
    }
    const covered = classified.some(
        (doc) => doc.path === path && doc.docClass === "tracker",
    );
    if (covered) {
        return [];
    }
    return [ {
        file: root.sourcePath,
        keyPath: "tracker.file",
        rule: "docs.trackerUnchecked",
        message: `Nothing classifies the tracker \`${path}\` as \`tracker\`, `
            + "so none of the tracker rules ran over it.",
        remedy:
            "Add a glob matching it under `docs.tracker`, in the profile whose "
            + "docs root holds it, and check the file is there and not "
            + "gitignored. Globs resolve relative to that docs root; a leading "
            + "`/` matches from the repo root. Until one does, a task can sit "
            + "in Done with no evidence and an id can name two tasks.",
        severity: "error",
    } ];
}

/**
 * Where an in-repo tracker may and may not sit.
 *
 * Both directions of the same rule. A tracker filed under another class is
 * validated as that class, so its ids, states and evidence lines go
 * unchecked. Another file filed as `tracker` is a second place task state can
 * live, which is what the doctrine forbids: with ClickUp that cannot happen,
 * and in-repo it has to be said.
 */
function checkTrackerPlacement(
    profile: Profile,
    path: string,
    docClass: DocClass,
    out: Diagnostic[],
): void {
    const trackerFile = profile.tracker.file;
    // Without a tracker file there is nothing to compare a path against. A
    // product profile inherits the repository's, so this is the profile that
    // was parsed on its own; reading the absence as a mismatch reported every
    // such file as misfiled against a tracker named `undefined`.
    if (profile.tracker.backend !== "in-repo" || trackerFile === undefined) {
        return;
    }
    const file = profile.sourcePath;

    if (docClass === "tracker" && path !== trackerFile) {
        out.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerAuthority",
            message: `\`${path}\` is classified as \`tracker\`, but the `
                + `tracker is \`${trackerFile}\`.`,
            remedy: "Give it the class that fits what it holds. The tracker "
                + "file is the sole authority for task state, and a second "
                + "file carrying it means the answer to what is done depends "
                + "on which file a reader opens.",
            severity: "error",
        });
    }

    if (docClass !== "tracker" && path === trackerFile) {
        out.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerMisfiled",
            message: `The tracker file \`${path}\` is classified as `
                + `\`${docClass}\`, not \`tracker\`.`,
            remedy:
                "Move its glob to docs.tracker. Only that class checks task "
                + "ids, states, and the evidence line Done requires.",
            severity: "error",
        });
    }
}
